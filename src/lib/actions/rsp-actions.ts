"use server";

import { revalidatePath } from "next/cache";
import { addMonths, format, parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import { computeRanking } from "@/lib/rsp-ranking";
import {
  DEFAULT_ASSESSMENT_CRITERIA,
  PUBLICATION_VALIDITY_MONTHS,
  MIN_POSTING_DAYS,
} from "@/lib/rsp-constants";
import type {
  RspVacancy,
  RspApplicant,
  RspApplication,
  RspAssessmentCriterion,
  RspAssessmentScore,
  RspAppointment,
} from "@/lib/types";
import type {
  VacancyFormValues,
  PublishVacancyValues,
  ApplicantFormValues,
  ApplicationFormValues,
  ScreeningValues,
  CriterionValues,
  ScoreEntry,
  AppointmentFormValues,
  AppointmentLifecycleValues,
} from "@/lib/validations/rsp-schema";

// Postgres unique-violation error code
const UNIQUE_VIOLATION = "23505";

export interface RspVacancyWithRelations extends RspVacancy {
  plantilla: {
    item_number: string | null;
    position_title: string | null;
    organizational_unit: string | null;
  } | null;
  application_count: number;
}

export interface RspApplicationWithApplicant extends RspApplication {
  rsp_applicants: RspApplicant | null;
  rsp_assessment_scores: RspAssessmentScore[];
}

export interface RspVacancyDetail extends RspVacancy {
  plantilla: {
    id: string;
    item_number: string | null;
    position_title: string | null;
    organizational_unit: string | null;
    salary_grade: number | null;
    is_vacant: boolean | null;
    is_funded: boolean | null;
  } | null;
  rsp_applications: RspApplicationWithApplicant[];
  rsp_assessment_criteria: RspAssessmentCriterion[];
  rsp_appointments: RspAppointment[];
}

export interface RspApplicantWithCount extends RspApplicant {
  application_count: number;
}

export interface RspApplicantDetail extends RspApplicant {
  rsp_applications: (RspApplication & {
    rsp_vacancies: {
      id: string;
      position_title: string;
      item_number: string;
      status: string;
    } | null;
  })[];
}

export interface RankedCandidate {
  application_id: string;
  applicant_id: string;
  applicant_name: string;
  status: string;
  /** Weighted score per criterion id: (score / max_score) × weight */
  criterion_scores: Record<string, number | null>;
  total: number;
  /** True when at least one criterion has no score yet (treated as 0). */
  incomplete: boolean;
  /** Competition ranking: ties share a rank (1, 2, 2, 4). */
  rank: number;
}

interface AuthResult {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
}

async function requireHrAdmin(): Promise<AuthResult | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["super_admin", "hr_admin"].includes(user.role))
    return { error: "Insufficient permissions" };
  return { user };
}

function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

// ============================================================
// Vacancies (Recruitment)
// ============================================================

export async function getVacancies(): Promise<RspVacancyWithRelations[]> {
  const auth = await requireHrAdmin();
  if ("error" in auth) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .select(
      "*, plantilla(item_number, position_title, organizational_unit), rsp_applications(count)"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const { rsp_applications, ...rest } = row as typeof row & {
      rsp_applications: { count: number }[] | null;
    };
    return {
      ...rest,
      application_count: rsp_applications?.[0]?.count ?? 0,
    } as RspVacancyWithRelations;
  });
}

export async function getVacancyById(id: string): Promise<RspVacancyDetail> {
  const auth = await requireHrAdmin();
  if ("error" in auth) throw new Error("Unauthorized");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .select(
      `
      *,
      plantilla(id, item_number, position_title, organizational_unit, salary_grade, is_vacant, is_funded),
      rsp_applications(*, rsp_applicants(*), rsp_assessment_scores(*)),
      rsp_assessment_criteria(*),
      rsp_appointments(*)
    `
    )
    .eq("id", id)
    .single();

  if (error) throw error;

  const detail = data as unknown as RspVacancyDetail;
  detail.rsp_assessment_criteria.sort((a, b) => a.sort_order - b.sort_order);
  detail.rsp_applications.sort((a, b) =>
    (a.rsp_applicants?.last_name ?? "").localeCompare(
      b.rsp_applicants?.last_name ?? ""
    )
  );
  return detail;
}

export interface VacantPlantillaItem {
  id: string;
  item_number: string | null;
  position_title: string | null;
  organizational_unit: string | null;
  salary_grade: number | null;
  step: number | null;
  civil_service_eligibility: string | null;
}

/** Vacant + funded plantilla items that don't already have a live recruitment. */
export async function getVacantPlantillaItems(): Promise<VacantPlantillaItem[]> {
  const auth = await requireHrAdmin();
  if ("error" in auth) return [];

  const supabase = createAdminClient();
  const [{ data: items, error }, { data: liveVacancies }] = await Promise.all([
    supabase
      .schema("hris")
      .from("plantilla")
      .select(
        "id, item_number, position_title, organizational_unit, salary_grade, step, civil_service_eligibility"
      )
      .eq("is_vacant", true)
      .eq("is_funded", true)
      .order("organizational_unit")
      .order("item_number"),
    supabase
      .schema("hris")
      .from("rsp_vacancies")
      .select("plantilla_id")
      .in("status", ["draft", "published", "closed"]),
  ]);

  if (error) throw error;

  const taken = new Set((liveVacancies ?? []).map((v) => v.plantilla_id));
  return (items ?? []).filter((i) => !taken.has(i.id));
}

/** Latest salary amount for a grade at step 1 (any tranche, newest year). */
async function lookupMonthlySalary(grade: number): Promise<number | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .schema("hris")
    .from("salary_grade_table")
    .select("amount")
    .eq("grade", grade)
    .eq("step", 1)
    .order("effective_year", { ascending: false })
    .limit(1);
  return data?.[0]?.amount ?? null;
}

export async function createVacancy(input: VacancyFormValues) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();

  const { data: plantilla, error: pErr } = await supabase
    .schema("hris")
    .from("plantilla")
    .select("id, is_vacant, is_funded")
    .eq("id", input.plantilla_id)
    .maybeSingle();

  if (pErr) return { error: pErr.message };
  if (!plantilla) return { error: "Plantilla item not found" };
  if (!plantilla.is_vacant)
    return { error: "This plantilla item is not vacant" };
  if (!plantilla.is_funded)
    return { error: "This plantilla item is not funded" };

  let monthlySalary = input.monthly_salary ?? null;
  if (monthlySalary == null && input.salary_grade) {
    monthlySalary = await lookupMonthlySalary(input.salary_grade);
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .insert({
      ...input,
      monthly_salary: monthlySalary,
      status: "draft",
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION)
      return { error: "This plantilla item already has an active recruitment" };
    return { error: error.message };
  }

  const { error: cErr } = await supabase
    .schema("hris")
    .from("rsp_assessment_criteria")
    .insert(
      DEFAULT_ASSESSMENT_CRITERIA.map((c) => ({ ...c, vacancy_id: data.id }))
    );
  if (cErr) console.error("[RSP] default criteria insert failed:", cErr);

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_vacancy_created",
    tableName: "rsp_vacancies",
    recordId: data.id,
    newValues: { ...input, monthly_salary: monthlySalary },
  });

  revalidatePath("/rsp");
  return { data };
}

export async function updateVacancy(id: string, input: VacancyFormValues) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["draft", "published"])
    .select("id");

  if (error) return { error: error.message };
  if (!data?.length)
    return {
      error: "Vacancy not found, or it can no longer be edited (already closed)",
    };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_vacancy_updated",
    tableName: "rsp_vacancies",
    recordId: id,
    newValues: input,
  });

  revalidatePath("/rsp");
  revalidatePath(`/rsp/${id}`);
  return { success: true };
}

export async function publishVacancy(id: string, input: PublishVacancyValues) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const from = parseISO(input.publication_date);
  const to = parseISO(input.closing_date);
  const postingDays =
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (postingDays < MIN_POSTING_DAYS)
    return {
      error: `Posting must be at least ${MIN_POSTING_DAYS} calendar days (RA 7041)`,
    };

  const expiry = format(
    addMonths(from, PUBLICATION_VALIDITY_MONTHS),
    "yyyy-MM-dd"
  );

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .update({
      publication_date: input.publication_date,
      closing_date: input.closing_date,
      csc_bulletin_no: input.csc_bulletin_no ?? null,
      publication_expiry_date: expiry,
      status: "published",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");

  if (error) return { error: error.message };
  if (!data?.length)
    return { error: "Vacancy not found or it was already published" };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_vacancy_published",
    tableName: "rsp_vacancies",
    recordId: id,
    newValues: { ...input, publication_expiry_date: expiry },
  });

  revalidatePath("/rsp");
  revalidatePath(`/rsp/${id}`);
  return { success: true };
}

export async function closeVacancy(id: string, force = false) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data: vacancy } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .select("id, status, closing_date")
    .eq("id", id)
    .maybeSingle();

  if (!vacancy) return { error: "Vacancy not found" };
  if (vacancy.status !== "published")
    return { error: "Only published vacancies can be closed" };
  if (!force && vacancy.closing_date && todayIso() < vacancy.closing_date)
    return {
      error: `The posting period runs until ${vacancy.closing_date}. Use "Close anyway" to close early.`,
    };

  const { error } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "published");

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_vacancy_closed",
    tableName: "rsp_vacancies",
    recordId: id,
    newValues: { forced: force },
  });

  revalidatePath("/rsp");
  revalidatePath(`/rsp/${id}`);
  return { success: true };
}

export async function cancelVacancy(id: string, remarks: string) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .update({
      status: "cancelled",
      remarks,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["draft", "published", "closed"])
    .select("id");

  if (error) return { error: error.message };
  if (!data?.length)
    return { error: "Vacancy not found or it can no longer be cancelled" };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_vacancy_cancelled",
    tableName: "rsp_vacancies",
    recordId: id,
    newValues: { remarks },
  });

  revalidatePath("/rsp");
  revalidatePath(`/rsp/${id}`);
  return { success: true };
}

export async function deleteDraftVacancy(id: string) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .delete()
    .eq("id", id)
    .eq("status", "draft")
    .select("id");

  if (error) return { error: error.message };
  if (!data?.length)
    return { error: "Draft vacancy not found or it was already published" };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_vacancy_draft_deleted",
    tableName: "rsp_vacancies",
    recordId: id,
  });

  revalidatePath("/rsp");
  return { success: true };
}

// ============================================================
// Applicants
// ============================================================

export async function getApplicants(
  search?: string
): Promise<RspApplicantWithCount[]> {
  const auth = await requireHrAdmin();
  if ("error" in auth) return [];

  const supabase = createAdminClient();
  let query = supabase
    .schema("hris")
    .from("rsp_applicants")
    .select("*, rsp_applications(count)")
    .order("last_name")
    .order("first_name");

  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`last_name.ilike.${term},first_name.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const { rsp_applications, ...rest } = row as typeof row & {
      rsp_applications: { count: number }[] | null;
    };
    return {
      ...rest,
      application_count: rsp_applications?.[0]?.count ?? 0,
    } as RspApplicantWithCount;
  });
}

export async function getApplicantById(
  id: string
): Promise<RspApplicantDetail> {
  const auth = await requireHrAdmin();
  if ("error" in auth) throw new Error("Unauthorized");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_applicants")
    .select(
      "*, rsp_applications(*, rsp_vacancies(id, position_title, item_number, status))"
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as unknown as RspApplicantDetail;
}

/** Non-blocking dedup hint for the applicant form: warns, never blocks. */
export async function findPossibleDuplicates(input: {
  first_name: string;
  last_name: string;
  birth_date?: string | null;
}): Promise<RspApplicant[]> {
  const auth = await requireHrAdmin();
  if ("error" in auth) return [];

  const supabase = createAdminClient();
  let query = supabase
    .schema("hris")
    .from("rsp_applicants")
    .select("*")
    .ilike("last_name", input.last_name.trim())
    .ilike("first_name", input.first_name.trim());

  if (input.birth_date) query = query.eq("birth_date", input.birth_date);

  const { data } = await query.limit(5);
  return (data ?? []) as RspApplicant[];
}

export async function createApplicant(input: ApplicantFormValues) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_applicants")
    .insert({ ...input, created_by: auth.user.id })
    .select()
    .single();

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_applicant_created",
    tableName: "rsp_applicants",
    recordId: data.id,
    newValues: input,
  });

  revalidatePath("/rsp/applicants");
  return { data };
}

export async function updateApplicant(id: string, input: ApplicantFormValues) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("rsp_applicants")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_applicant_updated",
    tableName: "rsp_applicants",
    recordId: id,
    newValues: input,
  });

  revalidatePath("/rsp/applicants");
  return { success: true };
}

export async function deleteApplicant(id: string) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { count } = await supabase
    .schema("hris")
    .from("rsp_applications")
    .select("id", { count: "exact", head: true })
    .eq("applicant_id", id);

  if ((count ?? 0) > 0)
    return {
      error:
        "This applicant has applications on record and cannot be deleted.",
    };

  const { error } = await supabase
    .schema("hris")
    .from("rsp_applicants")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_applicant_deleted",
    tableName: "rsp_applicants",
    recordId: id,
  });

  revalidatePath("/rsp/applicants");
  return { success: true };
}

// ============================================================
// Applications (Selection — screening)
// ============================================================

export async function createApplication(input: ApplicationFormValues) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data: vacancy } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .select("id, status, publication_expiry_date")
    .eq("id", input.vacancy_id)
    .maybeSingle();

  if (!vacancy) return { error: "Vacancy not found" };
  if (!["published", "closed"].includes(vacancy.status))
    return {
      error: "Applications can only be received for published or closed vacancies",
    };
  if (
    vacancy.publication_expiry_date &&
    todayIso() > vacancy.publication_expiry_date
  )
    return {
      error:
        "The 9-month publication validity has lapsed. Republish the vacancy before receiving applications.",
    };

  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_applications")
    .insert({ ...input, status: "pending" })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION)
      return { error: "This applicant has already applied for this vacancy" };
    return { error: error.message };
  }

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_application_created",
    tableName: "rsp_applications",
    recordId: data.id,
    newValues: input,
  });

  revalidatePath(`/rsp/${input.vacancy_id}`);
  return { data };
}

export async function updateApplication(
  id: string,
  input: Omit<ApplicationFormValues, "vacancy_id" | "applicant_id">
) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_applications")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending", "qualified"])
    .select("vacancy_id");

  if (error) return { error: error.message };
  if (!data?.length)
    return { error: "Application not found or it can no longer be edited" };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_application_updated",
    tableName: "rsp_applications",
    recordId: id,
    newValues: input,
  });

  revalidatePath(`/rsp/${data[0].vacancy_id}`);
  return { success: true };
}

export async function screenApplication(id: string, input: ScreeningValues) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();

  // Re-screening is allowed until HRMPSB scores exist for the application
  const { count: scoreCount } = await supabase
    .schema("hris")
    .from("rsp_assessment_scores")
    .select("id", { count: "exact", head: true })
    .eq("application_id", id);

  if ((scoreCount ?? 0) > 0)
    return {
      error:
        "This application already has HRMPSB scores. Remove the scores before re-screening.",
    };

  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_applications")
    .update({
      status: input.result,
      screened_by: auth.user.id,
      screened_at: new Date().toISOString(),
      screening_remarks: input.remarks ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["pending", "qualified", "disqualified"])
    .select("vacancy_id");

  if (error) return { error: error.message };
  if (!data?.length)
    return { error: "Application not found or it can no longer be screened" };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_application_screened",
    tableName: "rsp_applications",
    recordId: id,
    newValues: { result: input.result, remarks: input.remarks },
  });

  revalidatePath(`/rsp/${data[0].vacancy_id}`);
  return { success: true };
}

export async function withdrawApplication(id: string) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_applications")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending", "qualified"])
    .select("vacancy_id");

  if (error) return { error: error.message };
  if (!data?.length)
    return { error: "Application not found or it cannot be withdrawn" };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_application_withdrawn",
    tableName: "rsp_applications",
    recordId: id,
  });

  revalidatePath(`/rsp/${data[0].vacancy_id}`);
  return { success: true };
}

export async function deleteApplication(id: string) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_applications")
    .delete()
    .eq("id", id)
    .eq("status", "pending")
    .select("vacancy_id");

  if (error) return { error: error.message };
  if (!data?.length)
    return {
      error: "Application not found, or only pending applications can be deleted",
    };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_application_deleted",
    tableName: "rsp_applications",
    recordId: id,
  });

  revalidatePath(`/rsp/${data[0].vacancy_id}`);
  return { success: true };
}

// ============================================================
// HRMPSB comparative assessment (Selection — criteria and scores)
// ============================================================

export async function saveVacancyCriteria(
  vacancyId: string,
  criteria: CriterionValues[]
) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(totalWeight - 100) >= 0.01)
    return { error: "Criterion weights must total exactly 100%" };

  const supabase = createAdminClient();
  const { data: vacancy } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .select("id, status")
    .eq("id", vacancyId)
    .maybeSingle();

  if (!vacancy) return { error: "Vacancy not found" };
  if (["filled", "cancelled"].includes(vacancy.status))
    return { error: "Criteria can no longer be changed for this vacancy" };

  const { data: existing } = await supabase
    .schema("hris")
    .from("rsp_assessment_criteria")
    .select("id")
    .eq("vacancy_id", vacancyId);

  const keptIds = new Set(criteria.map((c) => c.id).filter(Boolean));
  const toDelete = (existing ?? [])
    .map((c) => c.id)
    .filter((cid) => !keptIds.has(cid));

  if (toDelete.length > 0) {
    // Cascade wipes any scores tied to the removed criteria (UI confirms first)
    const { error: dErr } = await supabase
      .schema("hris")
      .from("rsp_assessment_criteria")
      .delete()
      .in("id", toDelete);
    if (dErr) return { error: dErr.message };
  }

  for (const c of criteria) {
    const row = {
      vacancy_id: vacancyId,
      name: c.name,
      weight: c.weight,
      max_score: c.max_score,
      sort_order: c.sort_order,
    };
    const result = c.id
      ? await supabase
          .schema("hris")
          .from("rsp_assessment_criteria")
          .update(row)
          .eq("id", c.id)
      : await supabase
          .schema("hris")
          .from("rsp_assessment_criteria")
          .insert(row);
    if (result.error) {
      if (result.error.code === UNIQUE_VIOLATION)
        return { error: `Duplicate criterion name: "${c.name}"` };
      return { error: result.error.message };
    }
  }

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_criteria_saved",
    tableName: "rsp_assessment_criteria",
    recordId: vacancyId,
    newValues: { criteria, deleted: toDelete.length },
  });

  revalidatePath(`/rsp/${vacancyId}`);
  return { success: true };
}

export async function saveAssessmentScores(
  vacancyId: string,
  entries: ScoreEntry[]
) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;
  if (entries.length === 0) return { error: "No scores to save" };

  const supabase = createAdminClient();
  const [{ data: criteria }, { data: applications }] = await Promise.all([
    supabase
      .schema("hris")
      .from("rsp_assessment_criteria")
      .select("id, name, max_score")
      .eq("vacancy_id", vacancyId),
    supabase
      .schema("hris")
      .from("rsp_applications")
      .select("id, status")
      .eq("vacancy_id", vacancyId),
  ]);

  const criteriaById = new Map((criteria ?? []).map((c) => [c.id, c]));
  const appById = new Map((applications ?? []).map((a) => [a.id, a]));

  for (const entry of entries) {
    const criterion = criteriaById.get(entry.criterion_id);
    if (!criterion) return { error: "Unknown assessment criterion" };
    if (entry.score > criterion.max_score)
      return {
        error: `Score for "${criterion.name}" exceeds its maximum of ${criterion.max_score}`,
      };
    const app = appById.get(entry.application_id);
    if (!app) return { error: "Unknown application" };
    if (!["qualified", "selected"].includes(app.status))
      return { error: "Only qualified candidates can be scored" };
  }

  const { error } = await supabase
    .schema("hris")
    .from("rsp_assessment_scores")
    .upsert(
      entries.map((e) => ({ ...e, updated_at: new Date().toISOString() })),
      { onConflict: "application_id,criterion_id" }
    );

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_scores_saved",
    tableName: "rsp_assessment_scores",
    recordId: vacancyId,
    newValues: { entry_count: entries.length },
  });

  revalidatePath(`/rsp/${vacancyId}`);
  return { success: true };
}

export async function setDeliberationDate(vacancyId: string, date: string) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .update({
      hrmpsb_deliberation_date: date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vacancyId);

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_deliberation_date_set",
    tableName: "rsp_vacancies",
    recordId: vacancyId,
    newValues: { hrmpsb_deliberation_date: date },
  });

  revalidatePath(`/rsp/${vacancyId}`);
  return { success: true };
}

export async function getVacancyRanking(
  vacancyId: string
): Promise<RankedCandidate[]> {
  const detail = await getVacancyById(vacancyId);
  return computeRanking(detail.rsp_applications, detail.rsp_assessment_criteria);
}

// ============================================================
// Placement (selection of candidate + appointment lifecycle)
// ============================================================

export async function selectCandidate(applicationId: string) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data: application } = await supabase
    .schema("hris")
    .from("rsp_applications")
    .select("id, status, vacancy_id, rsp_vacancies(status)")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application) return { error: "Application not found" };
  if (application.status !== "qualified")
    return { error: "Only qualified candidates can be selected" };
  const rawVacancy = application.rsp_vacancies as unknown;
  const vacancyStatus = (
    (Array.isArray(rawVacancy) ? rawVacancy[0] : rawVacancy) as {
      status?: string;
    } | null
  )?.status;
  if (vacancyStatus !== "closed")
    return {
      error:
        "The vacancy must be closed (posting period over) before selecting a candidate",
    };

  const { error } = await supabase
    .schema("hris")
    .from("rsp_applications")
    .update({ status: "selected", updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .eq("status", "qualified");

  if (error) {
    if (error.code === UNIQUE_VIOLATION)
      return { error: "A candidate is already selected for this vacancy" };
    return { error: error.message };
  }

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_candidate_selected",
    tableName: "rsp_applications",
    recordId: applicationId,
  });

  revalidatePath(`/rsp/${application.vacancy_id}`);
  return { success: true };
}

export async function deselectCandidate(applicationId: string) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { count } = await supabase
    .schema("hris")
    .from("rsp_appointments")
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId)
    .eq("status", "issued");

  if ((count ?? 0) > 0)
    return {
      error:
        "An appointment has already been issued. Cancel the appointment instead.",
    };

  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_applications")
    .update({ status: "qualified", updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .eq("status", "selected")
    .select("vacancy_id");

  if (error) return { error: error.message };
  if (!data?.length)
    return { error: "Application not found or it is not selected" };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_candidate_deselected",
    tableName: "rsp_applications",
    recordId: applicationId,
  });

  revalidatePath(`/rsp/${data[0].vacancy_id}`);
  return { success: true };
}

export async function createAppointment(
  input: AppointmentFormValues & { override_expiry?: boolean }
) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data: application } = await supabase
    .schema("hris")
    .from("rsp_applications")
    .select(
      "id, status, vacancy_id, rsp_vacancies(id, status, plantilla_id, item_number, publication_expiry_date)"
    )
    .eq("id", input.application_id)
    .maybeSingle();

  if (!application) return { error: "Application not found" };
  if (application.status !== "selected")
    return { error: "The candidate must be selected before issuing an appointment" };

  // PostgREST returns a to-one object for this FK join, but the untyped
  // client infers an array — normalize both shapes.
  const rawVacancy = application.rsp_vacancies as unknown;
  const vacancy = (Array.isArray(rawVacancy) ? rawVacancy[0] : rawVacancy) as {
    id: string;
    status: string;
    plantilla_id: string;
    item_number: string;
    publication_expiry_date: string | null;
  } | null;
  if (!vacancy) return { error: "Vacancy not found" };

  if (
    vacancy.publication_expiry_date &&
    input.date_of_signing > vacancy.publication_expiry_date &&
    !input.override_expiry
  )
    return {
      error: `The 9-month publication validity lapsed on ${vacancy.publication_expiry_date}. Confirm the override to proceed (e.g., with CSC-granted exception).`,
      needs_override: true,
    };

  // Suggest a 6-month probationary period for original-permanent appointments
  let probationEnd: string | null = null;
  if (input.nature === "original" && input.status_type === "permanent") {
    probationEnd = format(
      addMonths(parseISO(input.date_of_signing), 6),
      "yyyy-MM-dd"
    );
  }

  const { override_expiry: _override, ...appointmentInput } = input;
  void _override;

  const { data, error } = await supabase
    .schema("hris")
    .from("rsp_appointments")
    .insert({
      ...appointmentInput,
      vacancy_id: vacancy.id,
      plantilla_id: vacancy.plantilla_id,
      item_number: vacancy.item_number,
      probation_end_date: probationEnd,
      status: "issued",
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION)
      return { error: "An appointment has already been issued for this vacancy" };
    return { error: error.message };
  }

  const { error: vErr } = await supabase
    .schema("hris")
    .from("rsp_vacancies")
    .update({ status: "filled", updated_at: new Date().toISOString() })
    .eq("id", vacancy.id);
  if (vErr) console.error("[RSP] vacancy fill update failed:", vErr);

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_appointment_issued",
    tableName: "rsp_appointments",
    recordId: data.id,
    newValues: { ...appointmentInput, probation_end_date: probationEnd },
  });

  revalidatePath("/rsp");
  revalidatePath(`/rsp/${vacancy.id}`);
  return { data };
}

export async function updateAppointment(
  id: string,
  input: AppointmentLifecycleValues
) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data: appointment } = await supabase
    .schema("hris")
    .from("rsp_appointments")
    .select("id, status, vacancy_id, date_of_signing, nature, status_type, probation_end_date")
    .eq("id", id)
    .maybeSingle();

  if (!appointment) return { error: "Appointment not found" };
  if (appointment.status !== "issued")
    return { error: "Only issued appointments can be updated" };

  if (input.oath_date && input.oath_date < appointment.date_of_signing)
    return { error: "Oath date cannot be before the date of signing" };
  if (
    input.assumption_date &&
    input.assumption_date < appointment.date_of_signing
  )
    return { error: "Assumption date cannot be before the date of signing" };

  // Recompute the probation suggestion from assumption for original-permanent
  let probationEnd = input.probation_end_date ?? null;
  if (
    !probationEnd &&
    input.assumption_date &&
    appointment.nature === "original" &&
    appointment.status_type === "permanent"
  ) {
    probationEnd = format(
      addMonths(parseISO(input.assumption_date), 6),
      "yyyy-MM-dd"
    );
  }

  const { error } = await supabase
    .schema("hris")
    .from("rsp_appointments")
    .update({
      oath_date: input.oath_date ?? null,
      assumption_date: input.assumption_date ?? null,
      probation_end_date: probationEnd ?? appointment.probation_end_date,
      remarks: input.remarks ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "issued");

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "rsp_appointment_updated",
    tableName: "rsp_appointments",
    recordId: id,
    newValues: { ...input, probation_end_date: probationEnd },
  });

  revalidatePath(`/rsp/${appointment.vacancy_id}`);
  return { success: true };
}

export async function cancelAppointment(
  id: string,
  input: { status: "disapproved" | "recalled" | "cancelled"; remarks: string }
) {
  const auth = await requireHrAdmin();
  if ("error" in auth) return auth;

  const supabase = createAdminClient();
  const { data: appointment } = await supabase
    .schema("hris")
    .from("rsp_appointments")
    .select("id, status, vacancy_id, application_id")
    .eq("id", id)
    .maybeSingle();

  if (!appointment) return { error: "Appointment not found" };
  if (appointment.status !== "issued")
    return { error: "Only issued appointments can be cancelled" };

  const { error } = await supabase
    .schema("hris")
    .from("rsp_appointments")
    .update({
      status: input.status,
      remarks: input.remarks,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "issued");

  if (error) return { error: error.message };

  // Revert so re-selection / reissue is possible within publication validity
  const [{ error: vErr }, { error: aErr }] = await Promise.all([
    supabase
      .schema("hris")
      .from("rsp_vacancies")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", appointment.vacancy_id)
      .eq("status", "filled"),
    supabase
      .schema("hris")
      .from("rsp_applications")
      .update({ status: "qualified", updated_at: new Date().toISOString() })
      .eq("id", appointment.application_id)
      .eq("status", "selected"),
  ]);
  if (vErr) console.error("[RSP] vacancy revert failed:", vErr);
  if (aErr) console.error("[RSP] application revert failed:", aErr);

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: `rsp_appointment_${input.status}`,
    tableName: "rsp_appointments",
    recordId: id,
    newValues: input,
  });

  revalidatePath("/rsp");
  revalidatePath(`/rsp/${appointment.vacancy_id}`);
  return { success: true };
}

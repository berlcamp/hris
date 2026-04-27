"use server";

import { revalidatePath } from "next/cache";
import { addYears, differenceInCalendarDays, startOfDay } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getSystemSettings } from "@/lib/actions/settings-actions";
import { NOSI_BASIS_SALARY_REASONS } from "@/lib/constants";

/**
 * Maximum IDs per `.in()` filter. PostgREST encodes `.in(col, ids)` as a URL
 * query string, and very large arrays (we routinely hit 700+ active plantilla
 * employees) push the URL past the server's 8 KiB URI limit, which fails with
 * an opaque empty error object. Chunking keeps every request well under that.
 */
const IN_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export interface EligibleEmployee {
  id: string;
  first_name: string;
  last_name: string;
  salary_grade: number;
  step_increment: number;
  department_id: string | null;
  departments: { name: string; code: string } | null;
  positions: { title: string } | null;
  last_increment_date: string | null;
  years_in_step: number;
  eligibility_date: string;
}

export interface UpcomingEligibleEmployee extends EligibleEmployee {
  days_until_eligibility: number;
}

export interface NosiWithRelations {
  id: string;
  employee_id: string;
  current_salary_grade: number;
  current_step: number;
  new_step: number;
  current_salary: number;
  new_salary: number;
  effective_date: string;
  last_increment_date: string | null;
  years_in_step: number | null;
  status: string;
  generated_by: string | null;
  reviewed_by: string | null;
  approved_by: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  employees: {
    first_name: string;
    last_name: string;
    salary_grade: number;
    step_increment: number;
    biometric_no: number;
    departments: { name: string; code: string } | null;
    positions: { title: string } | null;
  } | null;
}

interface NosiCandidate {
  emp: {
    id: string;
    first_name: string;
    last_name: string;
    salary_grade: number;
    step_increment: number;
    department_id: string | null;
    departments: { name: string; code: string } | null;
    positions: { title: string } | null;
  };
  lastDate: string;
  /** Earliest day the employee qualifies (lastDate + min years). */
  eligibilityDate: Date;
}

/** Loads all active plantilla candidates with their NOSI basis date and eligibility date. */
async function loadNosiCandidates(): Promise<{
  candidates: NosiCandidate[];
  minYears: number;
}> {
  const supabase = createAdminClient();
  const { nosi_eligibility_years: minYears } = await getSystemSettings();

  const { data: employees, error } = await supabase
    .schema("hris")
    .from("employees")
    .select("id, first_name, last_name, salary_grade, step_increment, department_id, departments!employees_department_id_fkey(name, code), positions(title)")
    .eq("status", "active")
    .eq("employment_type", "plantilla");

  if (error) {
    console.error("[NOSI] employees query error:", error);
  }
  if (error || !employees || employees.length === 0) {
    console.warn(
      "[NOSI] No active plantilla employees found. employees=",
      employees?.length ?? 0
    );
    return { candidates: [], minYears };
  }

  const ids = employees.map((e) => e.id);
  const idChunks = chunk(ids, IN_CHUNK_SIZE);

  // Pull salary_history + plantilla rows for these employees. We chunk the
  // `.in()` filters to keep each PostgREST request URL under the server's
  // length limit (see IN_CHUNK_SIZE).
  //
  // We use the salary_history rows for two things:
  //   - latest row by effective_date → current SG/Step (source of truth)
  //   - latest row whose reason resets the NOSI clock → eligibility basis date
  type HistoryRow = {
    employee_id: string;
    effective_date: string;
    salary_grade: number;
    step: number;
    reason: string;
    created_at: string;
  };
  type PlantillaRow = {
    employee_id: string | null;
    date_of_last_promotion_appointment: string | null;
    date_of_original_appointment: string | null;
  };

  const historyResults = await Promise.all(
    idChunks.map((c) =>
      supabase
        .schema("hris")
        .from("salary_history")
        .select(
          "employee_id, effective_date, salary_grade, step, reason, created_at"
        )
        .in("employee_id", c)
    )
  );
  const plantillaResults = await Promise.all(
    idChunks.map((c) =>
      supabase
        .schema("hris")
        .from("plantilla")
        .select(
          "employee_id, date_of_last_promotion_appointment, date_of_original_appointment"
        )
        .in("employee_id", c)
    )
  );

  const historyRows: HistoryRow[] = [];
  for (const res of historyResults) {
    if (res.error) {
      console.error(
        "[NOSI] salary_history query error:",
        JSON.stringify(res.error, Object.getOwnPropertyNames(res.error))
      );
      continue;
    }
    if (res.data) historyRows.push(...(res.data as HistoryRow[]));
  }

  const plantillaRows: PlantillaRow[] = [];
  for (const res of plantillaResults) {
    if (res.error) {
      console.error(
        "[NOSI] plantilla query error:",
        JSON.stringify(res.error, Object.getOwnPropertyNames(res.error))
      );
      continue;
    }
    if (res.data) plantillaRows.push(...(res.data as PlantillaRow[]));
  }

  console.info(
    `[NOSI] loadNosiCandidates: minYears=${minYears} active_plantilla=${employees.length} chunks=${idChunks.length} salary_history_rows=${historyRows.length} plantilla_rows=${plantillaRows.length}`
  );

  const basisSet = new Set<string>(NOSI_BASIS_SALARY_REASONS);
  const latestRowByEmp = new Map<
    string,
    { effective_date: string; created_at: string; salary_grade: number; step: number }
  >();
  const latestBasisByEmp = new Map<string, string>();

  for (const row of historyRows) {
    const t = new Date(row.effective_date).getTime();
    if (Number.isNaN(t)) continue;

    const existing = latestRowByEmp.get(row.employee_id);
    const existingT = existing ? new Date(existing.effective_date).getTime() : -Infinity;
    const existingCreated = existing ? new Date(existing.created_at).getTime() : -Infinity;
    const rowCreated = new Date(row.created_at).getTime();
    if (
      !existing ||
      t > existingT ||
      (t === existingT && rowCreated > existingCreated)
    ) {
      latestRowByEmp.set(row.employee_id, {
        effective_date: row.effective_date,
        created_at: row.created_at,
        salary_grade: row.salary_grade,
        step: row.step,
      });
    }

    if (basisSet.has(row.reason)) {
      const existingBasis = latestBasisByEmp.get(row.employee_id);
      if (!existingBasis || t > new Date(existingBasis).getTime()) {
        latestBasisByEmp.set(row.employee_id, row.effective_date);
      }
    }
  }

  const plantillaByEmp = new Map<
    string,
    {
      date_of_last_promotion_appointment: string | null;
      date_of_original_appointment: string | null;
    }
  >();
  for (const row of plantillaRows) {
    if (row.employee_id) {
      plantillaByEmp.set(row.employee_id, {
        date_of_last_promotion_appointment: row.date_of_last_promotion_appointment,
        date_of_original_appointment: row.date_of_original_appointment,
      });
    }
  }

  const candidates: NosiCandidate[] = [];
  const skipped = {
    at_top_step: 0,
    no_basis_date: 0,
    invalid_basis_date: 0,
  };
  for (const emp of employees) {
    // Current SG/Step: prefer the latest salary_history row; fall back to the cached employees row
    const latest = latestRowByEmp.get(emp.id);
    const currentGrade = latest?.salary_grade ?? emp.salary_grade;
    const currentStep = latest?.step ?? emp.step_increment;

    // Already at top of grade — no NOSI possible
    if (currentStep >= 8) {
      skipped.at_top_step++;
      continue;
    }

    // NOSI basis date: latest effective_date among NOSI_BASIS_SALARY_REASONS,
    // then plantilla appointment fallbacks for legacy/migrated employees.
    const p = plantillaByEmp.get(emp.id);
    const fromSalary = latestBasisByEmp.get(emp.id);
    const lastDate =
      fromSalary ??
      p?.date_of_last_promotion_appointment ??
      p?.date_of_original_appointment ??
      null;

    if (!lastDate) {
      skipped.no_basis_date++;
      continue;
    }

    const baseDate = new Date(lastDate);
    if (Number.isNaN(baseDate.getTime())) {
      skipped.invalid_basis_date++;
      continue;
    }

    const eligibilityDate = startOfDay(addYears(baseDate, minYears));
    const dept = Array.isArray(emp.departments)
      ? emp.departments[0] ?? null
      : emp.departments;
    const pos = Array.isArray(emp.positions)
      ? emp.positions[0] ?? null
      : emp.positions;

    candidates.push({
      emp: {
        id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        salary_grade: currentGrade,
        step_increment: currentStep,
        department_id: emp.department_id,
        departments: dept,
        positions: pos,
      },
      lastDate,
      eligibilityDate,
    });
  }

  console.info(
    `[NOSI] loadNosiCandidates: candidates=${candidates.length} skipped=${JSON.stringify(skipped)}`
  );

  return { candidates, minYears };
}

function yearsBetween(fromIso: string, toMs: number): number {
  return Math.floor(
    (toMs - new Date(fromIso).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  );
}

export async function getEligibleForNosi(): Promise<EligibleEmployee[]> {
  const { candidates } = await loadNosiCandidates();
  const today = startOfDay(new Date());
  const todayMs = today.getTime();

  const eligible: EligibleEmployee[] = [];
  for (const c of candidates) {
    if (c.eligibilityDate.getTime() > todayMs) continue;
    eligible.push({
      ...c.emp,
      last_increment_date: c.lastDate,
      years_in_step: Math.max(0, yearsBetween(c.lastDate, todayMs)),
      eligibility_date: c.eligibilityDate.toISOString().slice(0, 10),
    });
  }
  return eligible;
}

/**
 * Active plantilla employees whose NOSI eligibility falls within `daysAhead`
 * (default 30) calendar days from today. Sorted by soonest eligibility first.
 */
export async function getUpcomingNosiIncrements(
  daysAhead = 30
): Promise<UpcomingEligibleEmployee[]> {
  const { candidates } = await loadNosiCandidates();
  const today = startOfDay(new Date());
  const todayMs = today.getTime();

  const upcoming: UpcomingEligibleEmployee[] = [];
  for (const c of candidates) {
    const days = differenceInCalendarDays(c.eligibilityDate, today);
    if (days <= 0 || days > daysAhead) continue;
    upcoming.push({
      ...c.emp,
      last_increment_date: c.lastDate,
      years_in_step: Math.max(0, yearsBetween(c.lastDate, todayMs)),
      eligibility_date: c.eligibilityDate.toISOString().slice(0, 10),
      days_until_eligibility: days,
    });
  }

  upcoming.sort((a, b) => a.days_until_eligibility - b.days_until_eligibility);
  return upcoming;
}

export async function getNosisRecords() {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("nosi_records")
    .select(`
      *,
      employees(
        first_name, last_name, salary_grade, step_increment, biometric_no,
        departments!employees_department_id_fkey(name, code),
        positions(title)
      )
    `)
    .order("created_at", { ascending: false });

  if (user.role === "department_head" && user.departmentId) {
    // Filter by employees in this department
    const { data: deptEmployees } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("department_id", user.departmentId);
    const ids = (deptEmployees ?? []).map((e) => e.id);
    if (ids.length > 0) query = query.in("employee_id", ids);
    else return [];
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as NosiWithRelations[];
}

export async function getNosiById(id: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("nosi_records")
    .select(`
      *,
      employees(
        first_name, last_name, salary_grade, step_increment, biometric_no,
        hire_date,
        departments!employees_department_id_fkey(name, code),
        positions(title)
      )
    `)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as NosiWithRelations;
}

export async function getSalaryAmount(grade: number, step: number): Promise<number> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .schema("hris")
    .from("salary_grade_table")
    .select("amount")
    .eq("grade", grade)
    .eq("step", step)
    .order("effective_year", { ascending: false })
    .limit(1);
  return data?.[0]?.amount ?? 0;
}

export async function createNosi(input: {
  employee_id: string;
  current_salary_grade: number;
  current_step: number;
  new_step: number;
  current_salary: number;
  new_salary: number;
  effective_date: string;
  last_increment_date: string | null;
  years_in_step: number | null;
  remarks: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("nosi_records")
    .insert({ ...input, status: "draft", generated_by: user.id })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath("/nosi");
  return { data };
}

export async function submitNosi(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("nosi_records")
    .update({ status: "pending" })
    .eq("id", id)
    .eq("status", "draft");

  if (error) return { error: error.message };
  revalidatePath(`/nosi/${id}`);
  revalidatePath("/nosi");
  return { success: true };
}

export async function deleteDraftNosi(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["super_admin", "hr_admin"].includes(user.role))
    return { error: "Insufficient permissions" };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("nosi_records")
    .delete()
    .eq("id", id)
    .eq("status", "draft")
    .select("id");

  if (error) return { error: error.message };
  if (!data?.length)
    return { error: "Draft NOSI not found or it was already submitted." };

  revalidatePath("/nosi");
  revalidatePath(`/nosi/${id}`);
  return { success: true };
}

export async function reviewNosi(id: string, approved: boolean, remarks?: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["department_head", "hr_admin", "super_admin"].includes(user.role))
    return { error: "Insufficient permissions" };

  const supabase = createAdminClient();

  if (!approved) {
    const { error } = await supabase
      .schema("hris")
      .from("nosi_records")
      .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString(), remarks: remarks ?? null })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath(`/nosi/${id}`);
    return { success: true };
  }

  // Check if this is final approval (super_admin) or intermediate review
  const { data: nosi } = await supabase.schema("hris").from("nosi_records").select("status, employee_id, current_salary_grade, new_step").eq("id", id).single();
  if (!nosi) return { error: "NOSI not found" };

  if (user.role === "super_admin") {
    // Final approval — update employee and salary history
    const { error } = await supabase
      .schema("hris")
      .from("nosi_records")
      .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };

    // Get the full NOSI record
    const { data: fullNosi } = await supabase.schema("hris").from("nosi_records").select("*").eq("id", id).single();
    if (fullNosi) {
      // Update employee step
      await supabase.schema("hris").from("employees").update({ step_increment: fullNosi.new_step }).eq("id", fullNosi.employee_id);
      // Insert salary history
      await supabase.schema("hris").from("salary_history").insert({
        employee_id: fullNosi.employee_id,
        salary_grade: fullNosi.current_salary_grade,
        step: fullNosi.new_step,
        salary_amount: fullNosi.new_salary,
        effective_date: fullNosi.effective_date,
        reason: "step_increment",
        reference_id: id,
        remarks: fullNosi.remarks,
      });
    }
  } else {
    // Intermediate review
    const { error } = await supabase
      .schema("hris")
      .from("nosi_records")
      .update({ reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
  }

  revalidatePath(`/nosi/${id}`);
  revalidatePath("/nosi");
  return { success: true };
}

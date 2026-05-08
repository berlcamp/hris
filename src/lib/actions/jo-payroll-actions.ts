"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  joPayrollMetadataSchema,
  type JoPayrollMetadataValues,
  type JoPayrollMemberValues,
} from "@/lib/validations/jo-payroll-schema";
import { computeJoGross } from "@/lib/utils/joPayrollAmount";

const ADMIN_ROLES = ["super_admin", "hr_admin"] as const;

function requireAdmin(role: string | undefined): boolean {
  return Boolean(role && (ADMIN_ROLES as readonly string[]).includes(role));
}

function trimNullable(s: string | null | undefined): string | null {
  if (s == null) return null;
  const v = s.trim();
  return v.length === 0 ? null : v;
}

export interface JoPayrollListRow {
  id: string;
  period_start: string;
  period_end: string;
  description: string | null;
  particulars: string | null;
  areas: string | null;
  days: number | null;
  payroll_date: string | null;
  created_at: string;
  member_count: number;
  total_amount: number;
}

export interface JoPayrollMemberWithEmployee {
  id: string;
  payroll_id: string;
  employee_id: string;
  days: number | null;
  hours: number | null;
  rate: number | null;
  employees: {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    employee_no: string;
    daily_rate: number | null;
    sss_no: string | null;
    sss_ss: number | null;
    sss_ec: number | null;
    account_number: string | null;
    tin_number: string | null;
    has_atm: boolean | null;
    area_assigned: string | null;
    sub_area: string | null;
  } | null;
}

export interface JoPayrollFilters {
  periodFrom?: string | null;
  periodTo?: string | null;
  page?: number;
  pageSize?: number;
}

export async function getJoPayrolls(
  filters: JoPayrollFilters = {},
): Promise<{ rows: JoPayrollListRow[]; totalCount: number }> {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { rows: [], totalCount: 0 };

  const supabase = createAdminClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .schema("hris")
    .from("jo_payroll")
    .select("*", { count: "exact" })
    .order("period_start", { ascending: false });

  if (filters.periodFrom) query = query.gte("period_end", filters.periodFrom);
  if (filters.periodTo) query = query.lte("period_start", filters.periodTo);

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  if (!data || data.length === 0) return { rows: [], totalCount: count ?? 0 };

  const ids = data.map((r) => r.id);
  const { data: members } = await supabase
    .schema("hris")
    .from("jo_payroll_members")
    .select("payroll_id, days, rate")
    .in("payroll_id", ids);

  const map = new Map<string, { count: number; total: number }>();
  for (const r of members ?? []) {
    const cur = map.get(r.payroll_id) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += computeJoGross(Number(r.rate), Number(r.days));
    map.set(r.payroll_id, cur);
  }

  const rows: JoPayrollListRow[] = data.map((p) => {
    const a = map.get(p.id) ?? { count: 0, total: 0 };
    return {
      id: p.id,
      period_start: p.period_start,
      period_end: p.period_end,
      description: p.description,
      particulars: p.particulars,
      areas: p.areas,
      days: p.days != null ? Number(p.days) : null,
      payroll_date: p.payroll_date,
      created_at: p.created_at,
      member_count: a.count,
      total_amount: a.total,
    };
  });

  return { rows, totalCount: count ?? 0 };
}

export async function getJoPayrollById(id: string): Promise<{
  payroll: JoPayrollListRow | null;
  members: JoPayrollMemberWithEmployee[];
}> {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) {
    return { payroll: null, members: [] };
  }

  const supabase = createAdminClient();
  const { data: payroll, error } = await supabase
    .schema("hris")
    .from("jo_payroll")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!payroll) return { payroll: null, members: [] };

  const { data: members } = await supabase
    .schema("hris")
    .from("jo_payroll_members")
    .select(
      `*, employees(id, first_name, middle_name, last_name, employee_no,
        daily_rate, sss_no, sss_ss, sss_ec, account_number, tin_number,
        has_atm, area_assigned, sub_area)`,
    )
    .eq("payroll_id", id);

  const sorted = ((members as JoPayrollMemberWithEmployee[]) ?? []).slice();
  sorted.sort((a, b) => {
    const an = `${a.employees?.last_name ?? ""}, ${a.employees?.first_name ?? ""}`;
    const bn = `${b.employees?.last_name ?? ""}, ${b.employees?.first_name ?? ""}`;
    return an.localeCompare(bn);
  });

  return {
    payroll: {
      id: payroll.id,
      period_start: payroll.period_start,
      period_end: payroll.period_end,
      description: payroll.description,
      particulars: payroll.particulars,
      areas: payroll.areas,
      days: payroll.days != null ? Number(payroll.days) : null,
      payroll_date: payroll.payroll_date,
      created_at: payroll.created_at,
      member_count: sorted.length,
      total_amount: sorted.reduce(
        (s, m) => s + computeJoGross(Number(m.rate), Number(m.days)),
        0,
      ),
    },
    members: sorted,
  };
}

export async function createJoPayroll(
  input: JoPayrollMetadataValues & { employee_ids: string[] },
) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const parsed = joPayrollMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.flatten().formErrors[0] ?? "Invalid payroll data",
    };
  }
  if (!input.employee_ids || input.employee_ids.length === 0) {
    return { error: "Select at least one employee" };
  }

  const supabase = createAdminClient();

  const { data: emps } = await supabase
    .schema("hris")
    .from("employees")
    .select("id, area_assigned, daily_rate")
    .in("id", input.employee_ids);

  const areas = Array.from(
    new Set((emps ?? []).map((e) => e.area_assigned).filter(Boolean) as string[]),
  )
    .sort()
    .join(", ");

  const { data: newPayroll, error } = await supabase
    .schema("hris")
    .from("jo_payroll")
    .insert({
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      description: trimNullable(parsed.data.description),
      particulars: trimNullable(parsed.data.particulars),
      areas: areas || null,
      days: parsed.data.days ?? null,
      payroll_date: parsed.data.payroll_date || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  const memberRows = (emps ?? []).map((e) => ({
    payroll_id: newPayroll.id,
    employee_id: e.id,
    days: parsed.data.days ?? null,
    hours: null,
    rate: e.daily_rate ?? null,
  }));

  const { error: memErr } = await supabase
    .schema("hris")
    .from("jo_payroll_members")
    .insert(memberRows);

  if (memErr) return { error: memErr.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "create",
    tableName: "jo_payroll",
    recordId: newPayroll.id,
  });

  revalidatePath("/jo-payroll");
  return { data: newPayroll };
}

export async function updateJoPayroll(
  id: string,
  input: JoPayrollMetadataValues,
) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const parsed = joPayrollMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.flatten().formErrors[0] ?? "Invalid payroll data",
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("jo_payroll")
    .update({
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      description: trimNullable(parsed.data.description),
      particulars: trimNullable(parsed.data.particulars),
      days: parsed.data.days ?? null,
      payroll_date: parsed.data.payroll_date || null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "update",
    tableName: "jo_payroll",
    recordId: id,
  });

  revalidatePath("/jo-payroll");
  return { data };
}

export async function deleteJoPayroll(id: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("jo_payroll")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "delete",
    tableName: "jo_payroll",
    recordId: id,
  });

  revalidatePath("/jo-payroll");
  return { success: true };
}

export async function duplicateJoPayroll(
  sourceId: string,
  metadata: JoPayrollMetadataValues,
) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const parsed = joPayrollMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    return {
      error: parsed.error.flatten().formErrors[0] ?? "Invalid payroll data",
    };
  }

  const supabase = createAdminClient();

  const { data: src } = await supabase
    .schema("hris")
    .from("jo_payroll")
    .select("areas, particulars")
    .eq("id", sourceId)
    .single();

  const { data: newPayroll, error } = await supabase
    .schema("hris")
    .from("jo_payroll")
    .insert({
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      description: trimNullable(parsed.data.description),
      particulars: trimNullable(parsed.data.particulars) ?? src?.particulars ?? null,
      areas: src?.areas ?? null,
      days: parsed.data.days ?? null,
      payroll_date: parsed.data.payroll_date || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  const { data: srcMembers } = await supabase
    .schema("hris")
    .from("jo_payroll_members")
    .select("employee_id, rate")
    .eq("payroll_id", sourceId);

  if (srcMembers && srcMembers.length > 0) {
    const cloned = srcMembers.map((m) => ({
      payroll_id: newPayroll.id,
      employee_id: m.employee_id,
      days: parsed.data.days ?? null,
      hours: null,
      rate: m.rate,
    }));
    const { error: cErr } = await supabase
      .schema("hris")
      .from("jo_payroll_members")
      .insert(cloned);
    if (cErr) return { error: cErr.message };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "duplicate",
    tableName: "jo_payroll",
    recordId: newPayroll.id,
    newValues: { source_id: sourceId },
  });

  revalidatePath("/jo-payroll");
  return { data: newPayroll };
}

export async function addJoPayrollMember(input: {
  payroll_id: string;
  employee_id: string;
  days?: number | null;
  rate?: number | null;
}) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  let rate = input.rate ?? null;
  if (rate == null) {
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("daily_rate")
      .eq("id", input.employee_id)
      .maybeSingle();
    rate = emp?.daily_rate ?? null;
  }

  const { error } = await supabase
    .schema("hris")
    .from("jo_payroll_members")
    .insert({
      payroll_id: input.payroll_id,
      employee_id: input.employee_id,
      days: input.days ?? null,
      hours: null,
      rate,
    });

  if (error) return { error: error.message };

  revalidatePath("/jo-payroll");
  return { success: true };
}

export async function updateJoPayrollMember(
  id: string,
  input: JoPayrollMemberValues,
) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("jo_payroll_members")
    .update({
      days: input.days ?? null,
      hours: input.hours ?? null,
      rate: input.rate ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/jo-payroll");
  return { data };
}

export async function deleteJoPayrollMember(id: string) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("jo_payroll_members")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/jo-payroll");
  return { success: true };
}

export interface JoEmployeeForPayroll {
  id: string;
  employee_no: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  area_assigned: string | null;
  daily_rate: number | null;
  account_number: string | null;
  has_atm: boolean | null;
}

export async function getJoEmployees(
  excludePayrollId?: string,
): Promise<JoEmployeeForPayroll[]> {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return [];

  const supabase = createAdminClient();

  let excludeIds = new Set<string>();
  if (excludePayrollId) {
    const { data: existing } = await supabase
      .schema("hris")
      .from("jo_payroll_members")
      .select("employee_id")
      .eq("payroll_id", excludePayrollId);
    excludeIds = new Set((existing ?? []).map((r) => r.employee_id));
  }

  const { data } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, employee_no, first_name, middle_name, last_name, area_assigned, daily_rate, account_number, has_atm",
    )
    .eq("status", "active")
    .eq("employment_type", "jo")
    .order("area_assigned")
    .order("last_name");

  return (data ?? [])
    .filter((e) => !excludeIds.has(e.id))
    .map((e) => ({
      id: e.id,
      employee_no: e.employee_no,
      first_name: e.first_name,
      middle_name: e.middle_name,
      last_name: e.last_name,
      area_assigned: e.area_assigned,
      daily_rate: e.daily_rate != null ? Number(e.daily_rate) : null,
      account_number: e.account_number,
      has_atm: e.has_atm,
    }));
}

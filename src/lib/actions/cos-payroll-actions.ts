"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  cosPayrollMetadataSchema,
  type CosPayrollMetadataValues,
  type CosEmployeePayrollValues,
} from "@/lib/validations/cos-payroll-schema";
import { computeCosNetAmount } from "@/lib/utils/cosPayrollAmount";

const ADMIN_ROLES = ["super_admin", "hr_admin"] as const;

function requireAdmin(role: string | undefined): boolean {
  return Boolean(role && (ADMIN_ROLES as readonly string[]).includes(role));
}

function trimNullable(s: string | null | undefined): string | null {
  if (s == null) return null;
  const v = s.trim();
  return v.length === 0 ? null : v;
}

export interface CosPayrollListRow {
  id: string;
  period_start: string;
  period_end: string;
  particulars: string | null;
  created_at: string;
  employee_count: number;
  total_amount: number;
}

export interface CosEmployeePayrollWithEmployee {
  id: string;
  payroll_id: string;
  employee_id: string;
  designation: string | null;
  monthly_rate: number | null;
  absent_without_pay: number | null;
  ss_contribution: number | null;
  ss_contribution_ec: number | null;
  percentage_tax_3: number | null;
  amount_received: number | null;
  employees: {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    employee_no: string;
    employment_type: string;
    departments: { name: string; code: string } | null;
    positions: { title: string } | null;
  } | null;
}

export interface CosPayrollFilters {
  periodFrom?: string | null;
  periodTo?: string | null;
  page?: number;
  pageSize?: number;
}

export async function getCosPayrolls(
  filters: CosPayrollFilters = {},
): Promise<{ rows: CosPayrollListRow[]; totalCount: number }> {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { rows: [], totalCount: 0 };

  const supabase = createAdminClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .schema("hris")
    .from("cos_payroll")
    .select("*", { count: "exact" })
    .order("period_start", { ascending: false });

  if (filters.periodFrom) query = query.gte("period_end", filters.periodFrom);
  if (filters.periodTo) query = query.lte("period_start", filters.periodTo);

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  if (!data || data.length === 0) return { rows: [], totalCount: count ?? 0 };

  const ids = data.map((r) => r.id);
  const { data: stats } = await supabase
    .schema("hris")
    .from("cos_employee_payroll")
    .select("payroll_id, amount_received")
    .in("payroll_id", ids);

  const map = new Map<string, { count: number; total: number }>();
  for (const r of stats ?? []) {
    const cur = map.get(r.payroll_id) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(r.amount_received ?? 0);
    map.set(r.payroll_id, cur);
  }

  const rows: CosPayrollListRow[] = data.map((p) => {
    const a = map.get(p.id) ?? { count: 0, total: 0 };
    return {
      id: p.id,
      period_start: p.period_start,
      period_end: p.period_end,
      particulars: p.particulars,
      created_at: p.created_at,
      employee_count: a.count,
      total_amount: a.total,
    };
  });

  return { rows, totalCount: count ?? 0 };
}

export async function getCosPayrollById(id: string): Promise<{
  payroll: {
    id: string;
    period_start: string;
    period_end: string;
    particulars: string | null;
  } | null;
  employees: CosEmployeePayrollWithEmployee[];
}> {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) {
    return { payroll: null, employees: [] };
  }

  const supabase = createAdminClient();
  const { data: payroll, error } = await supabase
    .schema("hris")
    .from("cos_payroll")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!payroll) return { payroll: null, employees: [] };

  const { data: emps, error: empErr } = await supabase
    .schema("hris")
    .from("cos_employee_payroll")
    .select(
      `*, employees(id, first_name, middle_name, last_name, employee_no, employment_type,
        departments!employees_department_id_fkey(name, code),
        positions(title)
      )`,
    )
    .eq("payroll_id", id);

  if (empErr) throw empErr;

  const sorted = ((emps as CosEmployeePayrollWithEmployee[]) ?? []).slice();
  sorted.sort((a, b) => {
    const an = `${a.employees?.last_name ?? ""}, ${a.employees?.first_name ?? ""}`;
    const bn = `${b.employees?.last_name ?? ""}, ${b.employees?.first_name ?? ""}`;
    return an.localeCompare(bn);
  });

  return { payroll, employees: sorted };
}

export async function createCosPayroll(input: CosPayrollMetadataValues) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const parsed = cosPayrollMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.flatten().formErrors[0] ?? "Invalid payroll data",
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("cos_payroll")
    .insert({
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      particulars: trimNullable(parsed.data.particulars),
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "create",
    tableName: "cos_payroll",
    recordId: data.id,
  });

  revalidatePath("/cos-payroll");
  return { data };
}

export async function updateCosPayroll(
  id: string,
  input: CosPayrollMetadataValues,
) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const parsed = cosPayrollMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.flatten().formErrors[0] ?? "Invalid payroll data",
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("cos_payroll")
    .update({
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      particulars: trimNullable(parsed.data.particulars),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "update",
    tableName: "cos_payroll",
    recordId: id,
  });

  revalidatePath("/cos-payroll");
  return { data };
}

export async function deleteCosPayroll(id: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("cos_payroll")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "delete",
    tableName: "cos_payroll",
    recordId: id,
  });

  revalidatePath("/cos-payroll");
  return { success: true };
}

export async function duplicateCosPayroll(
  sourceId: string,
  metadata: CosPayrollMetadataValues,
) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const parsed = cosPayrollMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    return {
      error: parsed.error.flatten().formErrors[0] ?? "Invalid payroll data",
    };
  }

  const supabase = createAdminClient();

  const { data: newPayroll, error: insErr } = await supabase
    .schema("hris")
    .from("cos_payroll")
    .insert({
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      particulars: trimNullable(parsed.data.particulars),
    })
    .select()
    .single();

  if (insErr) return { error: insErr.message };

  const { data: srcEmps } = await supabase
    .schema("hris")
    .from("cos_employee_payroll")
    .select("*")
    .eq("payroll_id", sourceId);

  if (srcEmps && srcEmps.length > 0) {
    const cloned = srcEmps.map((row) => {
      const net = computeCosNetAmount({
        monthly_rate: row.monthly_rate,
        absent_without_pay: null,
        ss_contribution: row.ss_contribution,
        ss_contribution_ec: row.ss_contribution_ec,
        percentage_tax_3: row.percentage_tax_3,
      });
      return {
        payroll_id: newPayroll.id,
        employee_id: row.employee_id,
        designation: row.designation,
        monthly_rate: row.monthly_rate,
        absent_without_pay: null,
        ss_contribution: row.ss_contribution,
        ss_contribution_ec: row.ss_contribution_ec,
        percentage_tax_3: row.percentage_tax_3,
        amount_received: Math.round(net * 100) / 100,
      };
    });

    const { error: cloneErr } = await supabase
      .schema("hris")
      .from("cos_employee_payroll")
      .insert(cloned);

    if (cloneErr) return { error: cloneErr.message };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "duplicate",
    tableName: "cos_payroll",
    recordId: newPayroll.id,
    newValues: { source_id: sourceId },
  });

  revalidatePath("/cos-payroll");
  return { data: newPayroll };
}

export async function addCosEmployeesToPayroll(input: {
  payroll_id: string;
  employee_ids: string[];
}) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };
  if (input.employee_ids.length === 0) return { error: "No employees selected" };

  const supabase = createAdminClient();
  const { data: emps } = await supabase
    .schema("hris")
    .from("employees")
    .select("id, position_id, positions(title)")
    .in("id", input.employee_ids);

  const rows = (emps ?? []).map((e) => ({
    payroll_id: input.payroll_id,
    employee_id: e.id,
    designation: (e.positions as { title?: string } | null)?.title ?? null,
    monthly_rate: null,
  }));

  const { error } = await supabase
    .schema("hris")
    .from("cos_employee_payroll")
    .insert(rows);

  if (error) return { error: error.message };

  revalidatePath("/cos-payroll");
  return { success: true, added: rows.length };
}

export async function updateCosEmployeePayroll(
  id: string,
  input: CosEmployeePayrollValues,
) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  const net = computeCosNetAmount({
    monthly_rate: input.monthly_rate ?? null,
    absent_without_pay: input.absent_without_pay ?? null,
    ss_contribution: input.ss_contribution ?? null,
    ss_contribution_ec: input.ss_contribution_ec ?? null,
    percentage_tax_3: input.percentage_tax_3 ?? null,
  });

  const { data, error } = await supabase
    .schema("hris")
    .from("cos_employee_payroll")
    .update({
      designation: trimNullable(input.designation),
      monthly_rate: input.monthly_rate ?? null,
      absent_without_pay: input.absent_without_pay ?? null,
      ss_contribution: input.ss_contribution ?? null,
      ss_contribution_ec: input.ss_contribution_ec ?? null,
      percentage_tax_3: input.percentage_tax_3 ?? null,
      amount_received: Math.round(net * 100) / 100,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/cos-payroll");
  return { data };
}

export async function deleteCosEmployeePayroll(id: string) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("cos_employee_payroll")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/cos-payroll");
  return { success: true };
}

export interface AvailableCosEmployeeRow {
  id: string;
  employee_no: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  position_title: string | null;
  department_name: string | null;
}

export async function getAvailableCosEmployees(
  payrollId: string,
): Promise<AvailableCosEmployeeRow[]> {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return [];

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .schema("hris")
    .from("cos_employee_payroll")
    .select("employee_id")
    .eq("payroll_id", payrollId);

  const existingIds = new Set((existing ?? []).map((r) => r.employee_id));

  const { data } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      `id, employee_no, first_name, middle_name, last_name,
       departments!employees_department_id_fkey(name),
       positions(title)`,
    )
    .eq("status", "active")
    .eq("employment_type", "cos")
    .order("last_name");

  return (data ?? [])
    .filter((e) => !existingIds.has(e.id))
    .map((e) => ({
      id: e.id,
      employee_no: e.employee_no,
      first_name: e.first_name,
      middle_name: e.middle_name,
      last_name: e.last_name,
      position_title:
        (e.positions as { title?: string } | null)?.title ?? null,
      department_name:
        (e.departments as { name?: string } | null)?.name ?? null,
    }));
}

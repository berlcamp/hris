"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  payrollMetadataSchema,
  type PayrollMetadataValues,
  type EmployeePayrollValues,
} from "@/lib/validations/payroll-schema";
import { calculatePayrollAmounts } from "@/lib/utils/payrollAmountCalc";

const ADMIN_ROLES = ["super_admin", "hr_admin"] as const;

export interface PayrollListRow {
  id: string;
  period_start: string;
  period_end: string;
  particulars: string | null;
  particulars_2nd_half: string | null;
  created_at: string;
  employee_count: number;
  total_amount: number;
  total_amount_2nd_half: number;
}

export interface EmployeePayrollWithEmployee {
  id: string;
  payroll_id: string;
  employee_id: string;
  designation: string | null;
  monthly_rate: number | null;
  sif: number | null;
  withholding_tax: number | null;
  philhealth_personal_share: number | null;
  philhealth_govt_share: number | null;
  gsis_personal_share: number | null;
  gsis_govt_share: number | null;
  pag_ibig_personal_share: number | null;
  pag_ibig_govt_share: number | null;
  hmdf: number | null;
  pag_ibig_salary_loan: number | null;
  ss_contribution: number | null;
  ss_contribution_ec: number | null;
  gsis_repayments_mpl: number | null;
  gsis_repayments_mpl_lite: number | null;
  gsis_repayments_policy_loan: number | null;
  gsis_repayments_cpl: number | null;
  courage_2_contribution: number | null;
  courage_salary_loan: number | null;
  economic_enterprise_multipurpose_coop: number | null;
  eempc_salary_loan: number | null;
  emergency_loan: number | null;
  notice_of_disallowance: number | null;
  economic_enterprise_multipurpose_coop_pera: number | null;
  courage_2_pera_loan: number | null;
  amount_received: number | null;
  amount_received_2nd_half: number | null;
  lbp_savings_account_number: string | null;
  employees: {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    employee_no: string;
    employment_type: string;
    biometric_no: number | null;
    departments: { name: string; code: string } | null;
    positions: { title: string } | null;
    plantilla: { position_title: string | null }[] | null;
  } | null;
}

function requireAdmin(role: string | undefined): boolean {
  return Boolean(role && (ADMIN_ROLES as readonly string[]).includes(role));
}

function trimNullable(s: string | null | undefined): string | null {
  if (s == null) return null;
  const v = s.trim();
  return v.length === 0 ? null : v;
}

export interface PayrollListFilters {
  periodFrom?: string | null;
  periodTo?: string | null;
  page?: number;
  pageSize?: number;
}

export async function getPayrolls(filters: PayrollListFilters = {}): Promise<{
  rows: PayrollListRow[];
  totalCount: number;
}> {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) {
    return { rows: [], totalCount: 0 };
  }

  const supabase = createAdminClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .schema("hris")
    .from("payroll")
    .select("*", { count: "exact" })
    .order("period_start", { ascending: false });

  if (filters.periodFrom) {
    query = query.gte("period_end", filters.periodFrom);
  }
  if (filters.periodTo) {
    query = query.lte("period_start", filters.periodTo);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  if (!data || data.length === 0) {
    return { rows: [], totalCount: count ?? 0 };
  }

  const ids = data.map((r) => r.id);
  const { data: stats } = await supabase
    .schema("hris")
    .from("employee_payroll")
    .select("payroll_id, amount_received, amount_received_2nd_half")
    .in("payroll_id", ids);

  const aggregateMap = new Map<
    string,
    { count: number; total: number; total2: number }
  >();
  for (const r of stats ?? []) {
    const cur = aggregateMap.get(r.payroll_id) ?? {
      count: 0,
      total: 0,
      total2: 0,
    };
    cur.count += 1;
    cur.total += Number(r.amount_received ?? 0);
    cur.total2 += Number(r.amount_received_2nd_half ?? 0);
    aggregateMap.set(r.payroll_id, cur);
  }

  const rows: PayrollListRow[] = data.map((p) => {
    const agg = aggregateMap.get(p.id) ?? { count: 0, total: 0, total2: 0 };
    return {
      id: p.id,
      period_start: p.period_start,
      period_end: p.period_end,
      particulars: p.particulars,
      particulars_2nd_half: p.particulars_2nd_half,
      created_at: p.created_at,
      employee_count: agg.count,
      total_amount: agg.total,
      total_amount_2nd_half: agg.total2,
    };
  });

  return { rows, totalCount: count ?? 0 };
}

export async function getPayrollById(id: string): Promise<{
  payroll: {
    id: string;
    period_start: string;
    period_end: string;
    particulars: string | null;
    particulars_2nd_half: string | null;
  } | null;
  employees: EmployeePayrollWithEmployee[];
}> {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) {
    return { payroll: null, employees: [] };
  }

  const supabase = createAdminClient();
  const { data: payroll, error } = await supabase
    .schema("hris")
    .from("payroll")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!payroll) return { payroll: null, employees: [] };

  const { data: emps, error: empErr } = await supabase
    .schema("hris")
    .from("employee_payroll")
    .select(
      `*, employees(id, first_name, middle_name, last_name, employee_no, employment_type, biometric_no,
        departments!employees_department_id_fkey(name, code),
        positions(title),
        plantilla(position_title)
      )`,
    )
    .eq("payroll_id", id);

  if (empErr) throw empErr;

  const sorted = ((emps as EmployeePayrollWithEmployee[]) ?? []).slice();
  sorted.sort((a, b) => {
    const an = `${a.employees?.last_name ?? ""}, ${a.employees?.first_name ?? ""}`;
    const bn = `${b.employees?.last_name ?? ""}, ${b.employees?.first_name ?? ""}`;
    return an.localeCompare(bn);
  });

  return { payroll, employees: sorted };
}

export async function createPayroll(input: PayrollMetadataValues) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const parsed = payrollMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.flatten().formErrors[0] ?? "Invalid payroll data",
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("payroll")
    .insert({
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      particulars: trimNullable(parsed.data.particulars),
      particulars_2nd_half: trimNullable(parsed.data.particulars_2nd_half),
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "create",
    tableName: "payroll",
    recordId: data.id,
    newValues: { period_start: data.period_start, period_end: data.period_end },
  });

  revalidatePath("/payroll");
  return { data };
}

export async function updatePayroll(id: string, input: PayrollMetadataValues) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const parsed = payrollMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.flatten().formErrors[0] ?? "Invalid payroll data",
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("payroll")
    .update({
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      particulars: trimNullable(parsed.data.particulars),
      particulars_2nd_half: trimNullable(parsed.data.particulars_2nd_half),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "update",
    tableName: "payroll",
    recordId: id,
  });

  revalidatePath("/payroll");
  return { data };
}

export async function deletePayroll(id: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("payroll")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "delete",
    tableName: "payroll",
    recordId: id,
  });

  revalidatePath("/payroll");
  return { success: true };
}

export async function duplicatePayroll(
  sourceId: string,
  metadata: PayrollMetadataValues,
) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const parsed = payrollMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    return {
      error: parsed.error.flatten().formErrors[0] ?? "Invalid payroll data",
    };
  }

  const supabase = createAdminClient();

  const { data: newPayroll, error: insErr } = await supabase
    .schema("hris")
    .from("payroll")
    .insert({
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      particulars: trimNullable(parsed.data.particulars),
      particulars_2nd_half: trimNullable(parsed.data.particulars_2nd_half),
    })
    .select()
    .single();

  if (insErr) return { error: insErr.message };

  const { data: srcEmps, error: srcErr } = await supabase
    .schema("hris")
    .from("employee_payroll")
    .select("*")
    .eq("payroll_id", sourceId);

  if (srcErr) return { error: srcErr.message };

  if (srcEmps && srcEmps.length > 0) {
    const cloned = srcEmps.map((row) => {
      const recompute = calculatePayrollAmounts(row);
      const rec: Record<string, unknown> = { ...row };
      delete rec.id;
      delete rec.created_at;
      delete rec.updated_at;
      rec.payroll_id = newPayroll.id;
      if (recompute) {
        rec.amount_received = recompute.amount_received;
        rec.amount_received_2nd_half = recompute.amount_received_2nd_half;
      }
      return rec;
    });

    const { error: cloneErr } = await supabase
      .schema("hris")
      .from("employee_payroll")
      .insert(cloned);

    if (cloneErr) return { error: cloneErr.message };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "duplicate",
    tableName: "payroll",
    recordId: newPayroll.id,
    newValues: { source_id: sourceId },
  });

  revalidatePath("/payroll");
  return { data: newPayroll };
}

export interface AddEmployeesToPayrollInput {
  payroll_id: string;
  employee_ids: string[];
}

export async function addEmployeesToPayroll(input: AddEmployeesToPayrollInput) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  if (input.employee_ids.length === 0) return { error: "No employees selected" };

  const supabase = createAdminClient();

  const { data: emps, error: empErr } = await supabase
    .schema("hris")
    .from("employees")
    .select("id, salary_grade, step_increment, position_id, positions(title)")
    .in("id", input.employee_ids);

  if (empErr) return { error: empErr.message };

  const grades = Array.from(
    new Set((emps ?? []).map((e) => e.salary_grade).filter(Boolean)),
  );
  const { data: salaryRows } = await supabase
    .schema("hris")
    .from("salary_grade_table")
    .select("grade, step, amount")
    .in("grade", grades.length ? grades : [-1]);

  const salaryLookup = new Map<string, number>();
  for (const r of salaryRows ?? []) {
    salaryLookup.set(`${r.grade}-${r.step}`, Number(r.amount));
  }

  const rows = (emps ?? []).map((e) => {
    const monthly = salaryLookup.get(`${e.salary_grade}-${e.step_increment}`);
    return {
      payroll_id: input.payroll_id,
      employee_id: e.id,
      designation:
        (e.positions as { title?: string } | null)?.title ?? null,
      monthly_rate: monthly ?? null,
    };
  });

  const { error } = await supabase
    .schema("hris")
    .from("employee_payroll")
    .insert(rows);

  if (error) return { error: error.message };

  revalidatePath("/payroll");
  return { success: true, added: rows.length };
}

export async function updateEmployeePayroll(
  id: string,
  input: EmployeePayrollValues,
) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  const recompute = calculatePayrollAmounts({
    monthly_rate: input.monthly_rate ?? null,
    withholding_tax: input.withholding_tax ?? null,
    philhealth_personal_share: input.philhealth_personal_share ?? null,
    gsis_personal_share: input.gsis_personal_share ?? null,
    pag_ibig_personal_share: input.pag_ibig_personal_share ?? null,
    hmdf: input.hmdf ?? null,
    pag_ibig_salary_loan: input.pag_ibig_salary_loan ?? null,
    ss_contribution: input.ss_contribution ?? null,
    ss_contribution_ec: input.ss_contribution_ec ?? null,
    gsis_repayments_mpl: input.gsis_repayments_mpl ?? null,
    gsis_repayments_mpl_lite: input.gsis_repayments_mpl_lite ?? null,
    gsis_repayments_policy_loan: input.gsis_repayments_policy_loan ?? null,
    gsis_repayments_cpl: input.gsis_repayments_cpl ?? null,
    courage_2_contribution: input.courage_2_contribution ?? null,
    courage_salary_loan: input.courage_salary_loan ?? null,
    economic_enterprise_multipurpose_coop:
      input.economic_enterprise_multipurpose_coop ?? null,
    eempc_salary_loan: input.eempc_salary_loan ?? null,
    emergency_loan: input.emergency_loan ?? null,
    notice_of_disallowance: input.notice_of_disallowance ?? null,
  });

  const { data, error } = await supabase
    .schema("hris")
    .from("employee_payroll")
    .update({
      designation: trimNullable(input.designation),
      monthly_rate: input.monthly_rate ?? null,
      sif: input.sif ?? null,
      withholding_tax: input.withholding_tax ?? null,
      philhealth_personal_share: input.philhealth_personal_share ?? null,
      philhealth_govt_share: input.philhealth_govt_share ?? null,
      gsis_personal_share: input.gsis_personal_share ?? null,
      gsis_govt_share: input.gsis_govt_share ?? null,
      pag_ibig_personal_share: input.pag_ibig_personal_share ?? null,
      pag_ibig_govt_share: input.pag_ibig_govt_share ?? null,
      hmdf: input.hmdf ?? null,
      pag_ibig_salary_loan: input.pag_ibig_salary_loan ?? null,
      ss_contribution: input.ss_contribution ?? null,
      ss_contribution_ec: input.ss_contribution_ec ?? null,
      gsis_repayments_mpl: input.gsis_repayments_mpl ?? null,
      gsis_repayments_mpl_lite: input.gsis_repayments_mpl_lite ?? null,
      gsis_repayments_policy_loan: input.gsis_repayments_policy_loan ?? null,
      gsis_repayments_cpl: input.gsis_repayments_cpl ?? null,
      courage_2_contribution: input.courage_2_contribution ?? null,
      courage_salary_loan: input.courage_salary_loan ?? null,
      economic_enterprise_multipurpose_coop:
        input.economic_enterprise_multipurpose_coop ?? null,
      eempc_salary_loan: input.eempc_salary_loan ?? null,
      emergency_loan: input.emergency_loan ?? null,
      notice_of_disallowance: input.notice_of_disallowance ?? null,
      economic_enterprise_multipurpose_coop_pera:
        input.economic_enterprise_multipurpose_coop_pera ?? null,
      courage_2_pera_loan: input.courage_2_pera_loan ?? null,
      amount_received: recompute?.amount_received ?? null,
      amount_received_2nd_half: recompute?.amount_received_2nd_half ?? null,
      lbp_savings_account_number: trimNullable(input.lbp_savings_account_number),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/payroll");
  return { data };
}

export async function deleteEmployeePayroll(id: string) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("employee_payroll")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/payroll");
  return { success: true };
}

export interface AvailableEmployeeRow {
  id: string;
  employee_no: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  employment_type: string;
  position_title: string | null;
  department_name: string | null;
  department_code: string | null;
}

export async function getAvailableEmployeesForPayroll(
  payrollId: string,
): Promise<AvailableEmployeeRow[]> {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) return [];

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .schema("hris")
    .from("employee_payroll")
    .select("employee_id")
    .eq("payroll_id", payrollId);

  const existingIds = new Set((existing ?? []).map((r) => r.employee_id));

  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      `id, employee_no, first_name, middle_name, last_name, employment_type,
       departments!employees_department_id_fkey(name, code),
       positions(title)`,
    )
    .eq("status", "active")
    .eq("employment_type", "plantilla")
    .order("last_name");

  if (error) return [];

  return (data ?? [])
    .filter((e) => !existingIds.has(e.id))
    .map((e) => ({
      id: e.id,
      employee_no: e.employee_no,
      first_name: e.first_name,
      middle_name: e.middle_name,
      last_name: e.last_name,
      employment_type: e.employment_type,
      position_title:
        (e.positions as { title?: string } | null)?.title ?? null,
      department_name:
        (e.departments as { name?: string } | null)?.name ?? null,
      department_code:
        (e.departments as { code?: string } | null)?.code ?? null,
    }));
}

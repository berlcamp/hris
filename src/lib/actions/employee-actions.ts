"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import type { EmployeeFormValues } from "@/lib/validations/employee-schema";
import {
  salaryHistoryEntrySchema,
  salaryHistoryUpdateSchema,
  type SalaryHistoryEntryFormValues,
  type SalaryHistoryUpdateFormValues,
} from "@/lib/validations/salary-history-schema";

export interface EmployeeWithRelations {
  id: string;
  biometric_no: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  birth_date: string | null;
  gender: string | null;
  civil_status: string | null;
  address: string | null;
  phone: string | null;
  employment_type: string;
  position_id: string | null;
  department_id: string | null;
  salary_grade: number;
  step_increment: number;
  hire_date: string;
  end_of_contract: string | null;
  status: string;
  user_profile_id: string | null;
  vl_sl_needs_manual_entry: boolean;
  created_at: string;
  updated_at: string;
  departments: { name: string; code: string } | null;
  positions: { title: string; item_number: string | null } | null;
  plantilla: { position_title: string | null; item_number: string | null }[] | null;
}

export async function getEmployees() {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("employees")
    .select("*, departments!employees_department_id_fkey(name, code), positions(title, item_number), plantilla(position_title, item_number)")
    .order("created_at", { ascending: false });

  // Role-based filtering
  if (user.role === "department_head" || user.role === "department_admin") {
    if (!user.departmentId) return [];
    query = query.eq("department_id", user.departmentId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as EmployeeWithRelations[];
}

export async function getEmployeeById(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .select("*, departments!employees_department_id_fkey(name, code), positions(title, item_number), plantilla(position_title, item_number)")
    .eq("id", id)
    .single();

  if (error) throw error;

  if (
    user.role === "department_head" &&
    user.departmentId &&
    (data as EmployeeWithRelations).department_id !== user.departmentId
  ) {
    throw new Error("Not found");
  }

  return data as EmployeeWithRelations;
}

export async function getPositions(departmentId?: string | null) {
  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("positions")
    .select("id, title, item_number, salary_grade, department_id")
    .order("title");

  if (departmentId) {
    query = query.eq("department_id", departmentId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Next employee / biometric number for display on the create form (not reserved;
 * the DB assigns `biometric_no` on insert via serial).
 */
export async function generateEmployeeNo(): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .select("biometric_no")
    .order("biometric_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const next = (data?.biometric_no ?? 0) + 1;
  return String(next);
}

export async function createEmployee(input: EmployeeFormValues) {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    return { error: "Only HR Admin or Super Admin can create employees." };
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .insert({
      first_name: input.first_name,
      middle_name: input.middle_name,
      last_name: input.last_name,
      suffix: input.suffix,
      birth_date: input.birth_date,
      gender: input.gender,
      civil_status: input.civil_status,
      address: input.address,
      phone: input.phone,
      employment_type: input.employment_type,
      position_id: input.position_id,
      department_id: input.department_id,
      salary_grade: input.salary_grade,
      step_increment: input.step_increment,
      hire_date: input.hire_date,
      end_of_contract: input.end_of_contract,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "An employee with this information already exists." };
    }
    return { error: error.message };
  }

  // Create initial salary history record
  await supabase.schema("hris").from("salary_history").insert({
    employee_id: data.id,
    salary_grade: input.salary_grade,
    step: input.step_increment,
    salary_amount: 0, // Will be populated when salary grade table has data
    effective_date: input.hire_date,
    reason: "initial",
  });

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "create",
    tableName: "employees",
    recordId: data.id,
    newValues: { first_name: input.first_name, last_name: input.last_name },
  });

  revalidatePath("/employees");
  return { data };
}

export async function updateEmployee(
  id: string,
  input: EmployeeFormValues
) {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    return { error: "Only HR Admin or Super Admin can edit employees." };
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .update({
      first_name: input.first_name,
      middle_name: input.middle_name,
      last_name: input.last_name,
      suffix: input.suffix,
      birth_date: input.birth_date,
      gender: input.gender,
      civil_status: input.civil_status,
      address: input.address,
      phone: input.phone,
      employment_type: input.employment_type,
      position_id: input.position_id,
      department_id: input.department_id,
      salary_grade: input.salary_grade,
      step_increment: input.step_increment,
      hire_date: input.hire_date,
      end_of_contract: input.end_of_contract,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "An employee with this information already exists." };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "update",
    tableName: "employees",
    recordId: id,
    newValues: { first_name: input.first_name, last_name: input.last_name },
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  return { data };
}

export async function deactivateEmployee(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["super_admin", "hr_admin"].includes(currentUser.role)) {
    return { error: "Only HR Admin or Super Admin can deactivate employees." };
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .schema("hris")
    .from("employees")
    .update({ status: "inactive" })
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: currentUser?.id,
    userEmail: currentUser?.email,
    action: "update",
    tableName: "employees",
    recordId: id,
    newValues: { status: "inactive" },
  });

  revalidatePath("/employees");
  return { success: true };
}

export async function reactivateEmployee(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["super_admin", "hr_admin"].includes(currentUser.role)) {
    return { error: "Only HR Admin or Super Admin can reactivate employees." };
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .schema("hris")
    .from("employees")
    .update({ status: "active" })
    .eq("id", id);

  if (error) return { error: error.message };
  await logAudit({
    userId: currentUser?.id,
    userEmail: currentUser?.email,
    action: "update",
    tableName: "employees",
    recordId: id,
    newValues: { status: "active" },
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  return { success: true };
}

export async function getSalaryHistory(employeeId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("salary_history")
    .select("*")
    .eq("employee_id", employeeId)
    .order("effective_date", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Sync `employees.salary_grade` and `employees.step_increment` from the most
 * recent `salary_history` row (by `effective_date`, then `created_at`).
 * No-op when the employee has no history rows yet.
 *
 * Returns `{ updated: true, salary_grade, step }` if employees was changed,
 * or `{ updated: false }` otherwise.
 */
export async function syncEmployeeFromLatestSalaryHistory(
  employeeId: string
): Promise<
  | { updated: true; salary_grade: number; step: number }
  | { updated: false }
> {
  const supabase = createAdminClient();

  const { data: latest } = await supabase
    .schema("hris")
    .from("salary_history")
    .select("salary_grade, step")
    .eq("employee_id", employeeId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return { updated: false };

  const { data: emp } = await supabase
    .schema("hris")
    .from("employees")
    .select("salary_grade, step_increment")
    .eq("id", employeeId)
    .single();

  if (
    emp &&
    emp.salary_grade === latest.salary_grade &&
    emp.step_increment === latest.step
  ) {
    return { updated: false };
  }

  const { error } = await supabase
    .schema("hris")
    .from("employees")
    .update({
      salary_grade: latest.salary_grade,
      step_increment: latest.step,
    })
    .eq("id", employeeId);

  if (error) return { updated: false };

  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/nosi");

  return {
    updated: true,
    salary_grade: latest.salary_grade,
    step: latest.step,
  };
}

export async function addSalaryHistoryRecord(
  input: SalaryHistoryEntryFormValues
): Promise<{ success: true; id: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    return { error: "Unauthorized" };
  }

  const parsed = salaryHistoryEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors[0] ?? "Invalid data" };
  }

  const supabase = createAdminClient();
  const v = parsed.data;

  const { data: inserted, error } = await supabase
    .schema("hris")
    .from("salary_history")
    .insert({
      employee_id: v.employee_id,
      salary_grade: v.salary_grade,
      step: v.step,
      salary_amount: v.salary_amount,
      effective_date: v.effective_date,
      reason: v.reason,
      remarks: v.remarks ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "create",
    tableName: "salary_history",
    recordId: inserted.id,
    newValues: {
      employee_id: v.employee_id,
      reason: v.reason,
      effective_date: v.effective_date,
    },
  });

  await syncEmployeeFromLatestSalaryHistory(v.employee_id);

  revalidatePath("/employees");
  revalidatePath(`/employees/${v.employee_id}`);
  revalidatePath("/nosi");
  return { success: true, id: inserted.id };
}

export async function updateSalaryHistoryRecord(
  input: SalaryHistoryUpdateFormValues
): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    return { error: "Unauthorized" };
  }

  const parsed = salaryHistoryUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors[0] ?? "Invalid data" };
  }

  const supabase = createAdminClient();
  const v = parsed.data;

  const { data: existing, error: fetchError } = await supabase
    .schema("hris")
    .from("salary_history")
    .select("id, employee_id, salary_grade, step, effective_date, reason, remarks, salary_amount")
    .eq("id", v.id)
    .single();

  if (fetchError || !existing) {
    return { error: "Record not found." };
  }
  if (existing.employee_id !== v.employee_id) {
    return { error: "Invalid record." };
  }

  const { error } = await supabase
    .schema("hris")
    .from("salary_history")
    .update({
      salary_grade: v.salary_grade,
      step: v.step,
      salary_amount: v.salary_amount,
      effective_date: v.effective_date,
      reason: v.reason,
      remarks: v.remarks ?? null,
    })
    .eq("id", v.id)
    .eq("employee_id", v.employee_id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "update",
    tableName: "salary_history",
    recordId: v.id,
    oldValues: {
      salary_grade: existing.salary_grade,
      step: existing.step,
      effective_date: existing.effective_date,
      reason: existing.reason,
    },
    newValues: {
      salary_grade: v.salary_grade,
      step: v.step,
      effective_date: v.effective_date,
      reason: v.reason,
    },
  });

  await syncEmployeeFromLatestSalaryHistory(v.employee_id);

  revalidatePath("/employees");
  revalidatePath(`/employees/${v.employee_id}`);
  revalidatePath("/nosi");
  return { success: true };
}

export async function getLeaveCredits(employeeId: string) {
  const supabase = createAdminClient();

  const currentYear = new Date().getFullYear();

  const { data, error } = await supabase
    .schema("hris")
    .from("leave_credit_balances")
    .select("*, leave_types(code, name)")
    .eq("employee_id", employeeId)
    .eq("year", currentYear);

  if (error) throw error;
  return data;
}

export async function getServiceRecords(employeeId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("service_records")
    .select("*")
    .eq("employee_id", employeeId)
    .order("date_from", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getEmployeeForCurrentUser() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = createAdminClient();

  const { data } = await supabase
    .schema("hris")
    .from("employees")
    .select("id")
    .eq("user_profile_id", user.id)
    .maybeSingle();

  return data;
}

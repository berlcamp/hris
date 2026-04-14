"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import type { EmployeeFormValues } from "@/lib/validations/employee-schema";

export interface EmployeeWithRelations {
  id: string;
  employee_no: string;
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
  created_at: string;
  updated_at: string;
  departments: { name: string; code: string } | null;
  positions: { title: string; item_number: string | null } | null;
}

export async function getEmployees() {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("employees")
    .select("*, departments(name, code), positions(title, item_number)")
    .order("created_at", { ascending: false });

  // Role-based filtering
  if (user.role === "department_head" && user.departmentId) {
    query = query.eq("department_id", user.departmentId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as EmployeeWithRelations[];
}

export async function getEmployeeById(id: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .select("*, departments(name, code), positions(title, item_number)")
    .eq("id", id)
    .single();

  if (error) throw error;
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

export async function getUnlinkedUserProfiles() {
  const supabase = createAdminClient();

  // Get user profiles that are not yet linked to an employee
  const { data: linkedIds } = await supabase
    .schema("hris")
    .from("employees")
    .select("user_profile_id")
    .not("user_profile_id", "is", null);

  const linked = (linkedIds ?? []).map((e) => e.user_profile_id).filter(Boolean);

  let query = supabase
    .schema("hris")
    .from("user_profiles")
    .select("id, email, full_name")
    .eq("is_active", true)
    .order("full_name");

  if (linked.length > 0) {
    query = query.not("id", "in", `(${linked.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function generateEmployeeNo() {
  const supabase = createAdminClient();
  const year = new Date().getFullYear();
  const prefix = `LGU-${year}-`;

  const { data } = await supabase
    .schema("hris")
    .from("employees")
    .select("employee_no")
    .like("employee_no", `${prefix}%`)
    .order("employee_no", { ascending: false })
    .limit(1);

  let nextNum = 1;
  if (data && data.length > 0) {
    const last = data[0].employee_no;
    const numPart = parseInt(last.replace(prefix, ""), 10);
    if (!isNaN(numPart)) {
      nextNum = numPart + 1;
    }
  }

  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

export async function createEmployee(input: EmployeeFormValues) {
  const supabase = createAdminClient();

  const employeeNo = await generateEmployeeNo();

  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .insert({
      employee_no: employeeNo,
      user_profile_id: input.user_profile_id,
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

  revalidatePath("/employees");
  return { data };
}

export async function updateEmployee(
  id: string,
  input: EmployeeFormValues
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .update({
      user_profile_id: input.user_profile_id,
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

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  return { data };
}

export async function deactivateEmployee(id: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .schema("hris")
    .from("employees")
    .update({ status: "inactive" })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/employees");
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

export async function getLeaveCredits(employeeId: string) {
  const supabase = createAdminClient();

  const currentYear = new Date().getFullYear();

  const { data, error } = await supabase
    .schema("hris")
    .from("leave_credits")
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

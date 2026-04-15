"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";

export interface EligibleEmployee {
  id: string;
  employee_no: string;
  first_name: string;
  last_name: string;
  salary_grade: number;
  step_increment: number;
  department_id: string | null;
  departments: { name: string; code: string } | null;
  positions: { title: string } | null;
  last_increment_date: string | null;
  years_in_step: number;
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
    employee_no: string;
    first_name: string;
    last_name: string;
    salary_grade: number;
    step_increment: number;
    departments: { name: string; code: string } | null;
    positions: { title: string } | null;
  } | null;
}

export async function getEligibleForNosi(): Promise<EligibleEmployee[]> {
  const supabase = createAdminClient();
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

  // Get active plantilla employees not at max step (8)
  const { data: employees, error } = await supabase
    .schema("hris")
    .from("employees")
    .select("id, employee_no, first_name, last_name, salary_grade, step_increment, department_id, departments!employees_department_id_fkey(name, code), positions(title)")
    .eq("status", "active")
    .eq("employment_type", "plantilla")
    .lt("step_increment", 8);

  if (error || !employees) return [];

  // For each employee, check last step_increment salary history
  const eligible: EligibleEmployee[] = [];

  for (const emp of employees) {
    const { data: lastIncrement } = await supabase
      .schema("hris")
      .from("salary_history")
      .select("effective_date")
      .eq("employee_id", emp.id)
      .eq("reason", "step_increment")
      .order("effective_date", { ascending: false })
      .limit(1);

    // Also check initial hire date if no increment found
    const { data: initial } = await supabase
      .schema("hris")
      .from("salary_history")
      .select("effective_date")
      .eq("employee_id", emp.id)
      .eq("reason", "initial")
      .order("effective_date", { ascending: false })
      .limit(1);

    const lastDate = lastIncrement?.[0]?.effective_date ?? initial?.[0]?.effective_date ?? null;
    if (!lastDate) continue;

    const last = new Date(lastDate);
    const now = new Date();
    const yearsInStep = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

    if (yearsInStep >= 3) {
      // Check IPCR eligibility — must have at least Satisfactory rating
      const { data: ipcrCheck } = await supabase
        .schema("hris")
        .from("ipcr_records")
        .select("id, numerical_rating")
        .eq("employee_id", emp.id)
        .eq("status", "approved")
        .gte("numerical_rating", 2.5)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!ipcrCheck || ipcrCheck.length === 0) continue;

      // Supabase may return joined relations as arrays or objects
      const dept = Array.isArray(emp.departments) ? emp.departments[0] ?? null : emp.departments;
      const pos = Array.isArray(emp.positions) ? emp.positions[0] ?? null : emp.positions;
      eligible.push({
        id: emp.id,
        employee_no: emp.employee_no,
        first_name: emp.first_name,
        last_name: emp.last_name,
        salary_grade: emp.salary_grade,
        step_increment: emp.step_increment,
        department_id: emp.department_id,
        departments: dept,
        positions: pos,
        last_increment_date: lastDate,
        years_in_step: Math.floor(yearsInStep),
      });
    }
  }

  return eligible;
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
        employee_no, first_name, last_name, salary_grade, step_increment,
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
        employee_no, first_name, last_name, salary_grade, step_increment,
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

"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";

export interface NosaWithRelations {
  id: string;
  employee_id: string;
  previous_salary_grade: number;
  previous_step: number;
  previous_salary: number;
  new_salary_grade: number;
  new_step: number;
  new_salary: number;
  reason: string;
  effective_date: string;
  status: string;
  generated_by: string | null;
  reviewed_by: string | null;
  approved_by: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  legal_basis: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  employees: {
    employee_no: string;
    first_name: string;
    last_name: string;
    salary_grade: number;
    step_increment: number;
    position_id: string | null;
    departments: { name: string; code: string } | null;
    positions: { title: string } | null;
  } | null;
}

export async function getNosaRecords() {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("nosa_records")
    .select(`
      *,
      employees(
        employee_no, first_name, last_name, salary_grade, step_increment, position_id,
        departments!employees_department_id_fkey(name, code),
        positions(title)
      )
    `)
    .order("created_at", { ascending: false });

  if (user.role === "department_head" && user.departmentId) {
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
  return data as NosaWithRelations[];
}

export async function getNosaById(id: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("nosa_records")
    .select(`
      *,
      employees(
        employee_no, first_name, last_name, salary_grade, step_increment, position_id,
        hire_date,
        departments!employees_department_id_fkey(name, code),
        positions(title)
      )
    `)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as NosaWithRelations;
}

export async function createNosa(input: {
  employee_id: string;
  previous_salary_grade: number;
  previous_step: number;
  previous_salary: number;
  new_salary_grade: number;
  new_step: number;
  new_salary: number;
  reason: string;
  effective_date: string;
  legal_basis: string | null;
  remarks: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("nosa_records")
    .insert({ ...input, status: "draft", generated_by: user.id })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath("/nosa");
  return { data };
}

export async function submitNosa(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("nosa_records")
    .update({ status: "pending" })
    .eq("id", id)
    .eq("status", "draft");

  if (error) return { error: error.message };
  revalidatePath(`/nosa/${id}`);
  revalidatePath("/nosa");
  return { success: true };
}

export async function reviewNosa(id: string, approved: boolean, remarks?: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["department_head", "hr_admin", "super_admin"].includes(user.role))
    return { error: "Insufficient permissions" };

  const supabase = createAdminClient();

  if (!approved) {
    const { error } = await supabase
      .schema("hris")
      .from("nosa_records")
      .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString(), remarks: remarks ?? null })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath(`/nosa/${id}`);
    return { success: true };
  }

  if (user.role === "super_admin") {
    const { error } = await supabase
      .schema("hris")
      .from("nosa_records")
      .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };

    const { data: fullNosa } = await supabase.schema("hris").from("nosa_records").select("*").eq("id", id).single();
    if (fullNosa) {
      // Update employee salary grade and step
      await supabase.schema("hris").from("employees").update({
        salary_grade: fullNosa.new_salary_grade,
        step_increment: fullNosa.new_step,
      }).eq("id", fullNosa.employee_id);

      // Insert salary history
      await supabase.schema("hris").from("salary_history").insert({
        employee_id: fullNosa.employee_id,
        salary_grade: fullNosa.new_salary_grade,
        step: fullNosa.new_step,
        salary_amount: fullNosa.new_salary,
        effective_date: fullNosa.effective_date,
        reason: fullNosa.reason,
        reference_id: id,
        remarks: fullNosa.remarks,
      });
    }
  } else {
    const { error } = await supabase
      .schema("hris")
      .from("nosa_records")
      .update({ reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
  }

  revalidatePath(`/nosa/${id}`);
  revalidatePath("/nosa");
  return { success: true };
}

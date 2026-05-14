"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { isDeptHead } from "@/lib/auth-helpers";

export interface PlantillaRecord {
  id: string;
  employee_id: string | null;
  legacy_plantilla_id: number | null;
  item_number: string | null;
  position_title: string | null;
  organizational_unit: string | null;
  salary_grade: number | null;
  step: number | null;
  authorized_annual_salary: number | null;
  actual_annual_salary: number | null;
  area_code: string | null;
  area_type: string | null;
  level: string | null;
  level_supplemental: string | null;
  date_of_original_appointment: string | null;
  date_of_last_promotion_appointment: string | null;
  status: string | null;
  is_vacant: boolean;
  is_funded: boolean;
  vice: string | null;
  civil_service_eligibility: string | null;
  comment_annotation: string | null;
  gsis_bp_number: string | null;
  tin: string | null;
  pwd: string | null;
  indigenous_people: string | null;
  solo_parent: string | null;
  ref_last_name: string | null;
  ref_first_name: string | null;
  ref_middle_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlantillaListRow extends PlantillaRecord {
  employees: {
    id: string;
    first_name: string;
    last_name: string;
    status: string;
  } | null;
}

export async function getAllPlantilla(): Promise<PlantillaListRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();
  let query = supabase
    .schema("hris")
    .from("plantilla")
    .select("*, employees(id, first_name, last_name, status)")
    .order("organizational_unit", { ascending: true })
    .order("item_number", { ascending: true });

  if (isDeptHead(user.role) && user.departmentId) {
    const { data: deptEmps } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("department_id", user.departmentId);
    const ids = (deptEmps ?? []).map((e) => e.id);
    if (ids.length === 0) return [];
    query = query.in("employee_id", ids);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[getAllPlantilla]", error);
    return [];
  }
  return data as PlantillaListRow[];
}

export async function getPlantillaByEmployee(employeeId: string): Promise<PlantillaRecord | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = createAdminClient();

  if (isDeptHead(user.role) && user.departmentId) {
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("department_id")
      .eq("id", employeeId)
      .maybeSingle();
    if (!emp || emp.department_id !== user.departmentId) return null;
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("plantilla")
    .select("*")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error) return null;
  return data as PlantillaRecord | null;
}

export interface PlantillaUpdateInput {
  item_number?: string | null;
  position_title?: string | null;
  organizational_unit?: string | null;
  salary_grade?: number | null;
  step?: number | null;
  authorized_annual_salary?: number | null;
  actual_annual_salary?: number | null;
  area_code?: string | null;
  area_type?: string | null;
  level?: string | null;
  level_supplemental?: string | null;
  date_of_original_appointment?: string | null;
  date_of_last_promotion_appointment?: string | null;
  status?: string | null;
  is_vacant?: boolean;
  is_funded?: boolean;
  vice?: string | null;
  civil_service_eligibility?: string | null;
  comment_annotation?: string | null;
  gsis_bp_number?: string | null;
  tin?: string | null;
  pwd?: string | null;
  indigenous_people?: string | null;
  solo_parent?: string | null;
}

export async function updatePlantilla(
  plantillaId: string,
  employeeId: string,
  input: PlantillaUpdateInput
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["super_admin", "hr_admin"].includes(user.role))
    return { error: "Insufficient permissions" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("plantilla")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", plantillaId);

  if (error) return { error: error.message };
  revalidatePath(`/employees/${employeeId}`);
  return { success: true };
}

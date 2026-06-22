"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";

// Roles allowed to manage departments and department heads.
const DEPT_MANAGER_ROLES = ["super_admin", "ocm_admin"];

export interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  head_employee_id: string | null;
  head_name: string | null;
  employee_count: number;
}

export interface DepartmentEmployeeOption {
  id: string;
  name: string;
  is_department_head: boolean;
}

interface HeadRel {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
}

function formatName(e: HeadRel): string {
  const mi = e.middle_name?.trim()
    ? `${e.middle_name.trim().charAt(0).toUpperCase()}.`
    : "";
  return [e.first_name, mi, e.last_name, e.suffix].filter(Boolean).join(" ");
}

// --- Reads ---

export async function getDepartmentsWithDetails(): Promise<DepartmentRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  const [{ data: depts, error }, { data: emps }] = await Promise.all([
    supabase
      .schema("hris")
      .from("departments")
      .select(
        "id, name, code, head_employee_id, head:employees!departments_head_employee_id_fkey(first_name, middle_name, last_name, suffix)"
      )
      .order("name"),
    supabase.schema("hris").from("employees").select("department_id"),
  ]);

  if (error) throw error;

  const countByDept = new Map<string, number>();
  for (const e of (emps ?? []) as { department_id: string | null }[]) {
    if (!e.department_id) continue;
    countByDept.set(e.department_id, (countByDept.get(e.department_id) ?? 0) + 1);
  }

  return ((depts ?? []) as Array<{
    id: string;
    name: string;
    code: string;
    head_employee_id: string | null;
    head: HeadRel | HeadRel[] | null;
  }>).map((d) => {
    const headRel = Array.isArray(d.head) ? d.head[0] ?? null : d.head;
    return {
      id: d.id,
      name: d.name,
      code: d.code,
      head_employee_id: d.head_employee_id,
      head_name: headRel ? formatName(headRel) : null,
      employee_count: countByDept.get(d.id) ?? 0,
    };
  });
}

// Active employees whose home department is this one — candidates for the
// department head (the DTR signatory resolves the head by home department_id).
export async function getDepartmentEmployeeOptions(
  departmentId: string
): Promise<DepartmentEmployeeOption[]> {
  const user = await getCurrentUser();
  if (!user || !DEPT_MANAGER_ROLES.includes(user.role)) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .select("id, first_name, middle_name, last_name, suffix, is_department_head")
    .eq("department_id", departmentId)
    .eq("status", "active")
    .order("last_name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as Array<HeadRel & { id: string; is_department_head: boolean }>).map(
    (e) => ({
      id: e.id,
      name: formatName(e),
      is_department_head: e.is_department_head,
    })
  );
}

// --- Mutations ---

export async function createDepartment(input: { name: string; code: string }) {
  const user = await getCurrentUser();
  if (!user || !DEPT_MANAGER_ROLES.includes(user.role))
    return { error: "Unauthorized" };

  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!name) return { error: "Department name is required" };
  if (!code) return { error: "Department code is required" };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("departments")
    .insert({ name, code })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      return { error: "A department with that name or code already exists." };
    return { error: error.message };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "create_department",
    tableName: "departments",
    recordId: data.id,
    newValues: { name, code },
  });

  revalidatePath("/admin/departments");
  return { success: true };
}

export async function updateDepartment(
  id: string,
  input: { name: string; code: string }
) {
  const user = await getCurrentUser();
  if (!user || !DEPT_MANAGER_ROLES.includes(user.role))
    return { error: "Unauthorized" };

  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!name) return { error: "Department name is required" };
  if (!code) return { error: "Department code is required" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("departments")
    .update({ name, code, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    if (error.code === "23505")
      return { error: "A department with that name or code already exists." };
    return { error: error.message };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "update_department",
    tableName: "departments",
    recordId: id,
    newValues: { name, code },
  });

  revalidatePath("/admin/departments");
  revalidatePath("/employees");
  revalidatePath("/attendance");
  return { success: true };
}

export async function deleteDepartment(id: string) {
  const user = await getCurrentUser();
  if (!user || !DEPT_MANAGER_ROLES.includes(user.role))
    return { error: "Unauthorized" };

  const supabase = createAdminClient();

  // Block deletion while anything still references the department.
  const [home, detailed, profiles] = await Promise.all([
    supabase
      .schema("hris")
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("department_id", id),
    supabase
      .schema("hris")
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("detailed_department_id", id),
    supabase
      .schema("hris")
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .eq("department_id", id),
  ]);

  if ((home.count ?? 0) > 0)
    return {
      error: `Cannot delete: ${home.count} employee(s) belong to this department.`,
    };
  if ((detailed.count ?? 0) > 0)
    return {
      error: `Cannot delete: ${detailed.count} employee(s) are detailed to this department.`,
    };
  if ((profiles.count ?? 0) > 0)
    return {
      error: `Cannot delete: ${profiles.count} user account(s) are assigned to this department.`,
    };

  const { error } = await supabase
    .schema("hris")
    .from("departments")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "delete_department",
    tableName: "departments",
    recordId: id,
  });

  revalidatePath("/admin/departments");
  return { success: true };
}

// Assigns (or clears) the head of a department. The per-employee
// is_department_head flag is the source of truth for the DTR signatory block,
// so we enforce a single head per department: clear it for everyone in the
// department, set it on the chosen employee, and keep departments.head_employee_id
// in sync as a convenience pointer.
export async function setDepartmentHead(
  departmentId: string,
  employeeId: string | null
) {
  const user = await getCurrentUser();
  if (!user || !DEPT_MANAGER_ROLES.includes(user.role))
    return { error: "Unauthorized" };

  const supabase = createAdminClient();

  if (employeeId) {
    const { data: emp, error: empErr } = await supabase
      .schema("hris")
      .from("employees")
      .select("id, department_id")
      .eq("id", employeeId)
      .single();
    if (empErr || !emp) return { error: "Employee not found." };
    if (emp.department_id !== departmentId)
      return { error: "The selected employee does not belong to this department." };
  }

  // Clear the flag for everyone currently marked as head in this department.
  const { error: clearErr } = await supabase
    .schema("hris")
    .from("employees")
    .update({ is_department_head: false })
    .eq("department_id", departmentId)
    .eq("is_department_head", true);
  if (clearErr) return { error: clearErr.message };

  if (employeeId) {
    const { error: setErr } = await supabase
      .schema("hris")
      .from("employees")
      .update({ is_department_head: true })
      .eq("id", employeeId);
    if (setErr) return { error: setErr.message };
  }

  const { error: deptErr } = await supabase
    .schema("hris")
    .from("departments")
    .update({ head_employee_id: employeeId, updated_at: new Date().toISOString() })
    .eq("id", departmentId);
  if (deptErr) return { error: deptErr.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "set_department_head",
    tableName: "departments",
    recordId: departmentId,
    newValues: { head_employee_id: employeeId },
  });

  revalidatePath("/admin/departments");
  revalidatePath("/employees");
  revalidatePath("/attendance");
  return { success: true };
}

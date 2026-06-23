"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";

// Roles allowed to manage departments and department heads.
const DEPT_MANAGER_ROLES = ["super_admin", "ocm_admin", "dtr_manager"];

export interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  head_employee_id: string | null;
  /** Free-text head name used on the DTR when no employee head is assigned. */
  head_custom_name: string | null;
  /** Display name of the current head — employee head if set, else the custom name. */
  head_name: string | null;
  employee_count: number;
}

export interface DepartmentEmployeeOption {
  id: string;
  name: string;
  is_department_head: boolean;
  /** Code of the employee's home department, for disambiguating cross-department heads. */
  department_code: string | null;
  /** True when this employee's home department is the one being edited. */
  is_in_department: boolean;
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
        "id, name, code, head_employee_id, head_custom_name, head:employees!departments_head_employee_id_fkey(first_name, middle_name, last_name, suffix)"
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
    head_custom_name: string | null;
    head: HeadRel | HeadRel[] | null;
  }>).map((d) => {
    const headRel = Array.isArray(d.head) ? d.head[0] ?? null : d.head;
    return {
      id: d.id,
      name: d.name,
      code: d.code,
      head_employee_id: d.head_employee_id,
      head_custom_name: d.head_custom_name,
      head_name: headRel
        ? formatName(headRel)
        : d.head_custom_name?.trim()
          ? d.head_custom_name.trim()
          : null,
      employee_count: countByDept.get(d.id) ?? 0,
    };
  });
}

// Candidate heads for a department. The DTR signatory resolves the head from the
// departments.head_employee_id pointer, which can name any employee — so an
// employee may head a department other than their own. We therefore return all
// active employees, flagging which belong to the department being edited and
// surfacing each one's home-department code to disambiguate.
export async function getDepartmentEmployeeOptions(
  departmentId: string
): Promise<DepartmentEmployeeOption[]> {
  const user = await getCurrentUser();
  if (!user || !DEPT_MANAGER_ROLES.includes(user.role)) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, first_name, middle_name, last_name, suffix, is_department_head, department_id, departments!employees_department_id_fkey(code)"
    )
    .eq("status", "active")
    .order("last_name", { ascending: true });

  if (error) throw error;

  const options = ((data ?? []) as Array<
    HeadRel & {
      id: string;
      is_department_head: boolean;
      department_id: string | null;
      departments: { code: string } | { code: string }[] | null;
    }
  >).map((e) => {
    const dept = Array.isArray(e.departments) ? e.departments[0] ?? null : e.departments;
    return {
      id: e.id,
      name: formatName(e),
      is_department_head: e.is_department_head,
      department_code: dept?.code ?? null,
      is_in_department: e.department_id === departmentId,
    };
  });

  // Surface the department's own employees first, then everyone else by name.
  options.sort((a, b) => {
    if (a.is_in_department !== b.is_in_department) return a.is_in_department ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return options;
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

// Assigns (or clears) the head of a department. A head is either an active
// employee (employeeId) or, when the head is not in the active-employee roster,
// a free-text custom name printed on the DTR. The two are mutually exclusive —
// an employee head always wins, so setting one clears the other.
//
// departments.head_employee_id is the source of truth for the DTR signatory and
// may point at ANY active employee, so one employee can head several
// departments. The per-employee is_department_head flag only drives case 2 of
// the signatory rules (a head's own DTR is signed by the City Administrator);
// it is kept as a mirror of "is this employee the head of at least one
// department" so it stays correct when a head is assigned or removed.
export async function setDepartmentHead(
  departmentId: string,
  input: { employeeId: string | null; customName: string | null }
) {
  const user = await getCurrentUser();
  if (!user || !DEPT_MANAGER_ROLES.includes(user.role))
    return { error: "Unauthorized" };

  const supabase = createAdminClient();

  const employeeId = input.employeeId;
  // An employee head takes precedence over (and clears) any custom name.
  const customName = employeeId ? null : input.customName?.trim() || null;

  if (employeeId) {
    const { data: emp, error: empErr } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("id", employeeId)
      .single();
    if (empErr || !emp) return { error: "Employee not found." };
  }

  // The head this department currently points at, so we can re-evaluate that
  // person's flag once they may no longer be a head.
  const { data: deptBefore } = await supabase
    .schema("hris")
    .from("departments")
    .select("head_employee_id")
    .eq("id", departmentId)
    .single();
  const previousHeadId = deptBefore?.head_employee_id ?? null;

  const { error: deptErr } = await supabase
    .schema("hris")
    .from("departments")
    .update({
      head_employee_id: employeeId,
      head_custom_name: customName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", departmentId);
  if (deptErr) return { error: deptErr.message };

  // The newly assigned employee is a head.
  if (employeeId) {
    const { error: setErr } = await supabase
      .schema("hris")
      .from("employees")
      .update({ is_department_head: true })
      .eq("id", employeeId);
    if (setErr) return { error: setErr.message };
  }

  // The person we replaced keeps the flag only if they still head another
  // department.
  if (previousHeadId && previousHeadId !== employeeId) {
    const { count } = await supabase
      .schema("hris")
      .from("departments")
      .select("id", { count: "exact", head: true })
      .eq("head_employee_id", previousHeadId);
    const { error: demoteErr } = await supabase
      .schema("hris")
      .from("employees")
      .update({ is_department_head: (count ?? 0) > 0 })
      .eq("id", previousHeadId);
    if (demoteErr) return { error: demoteErr.message };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "set_department_head",
    tableName: "departments",
    recordId: departmentId,
    newValues: { head_employee_id: employeeId, head_custom_name: customName },
  });

  revalidatePath("/admin/departments");
  revalidatePath("/employees");
  revalidatePath("/attendance");
  return { success: true };
}

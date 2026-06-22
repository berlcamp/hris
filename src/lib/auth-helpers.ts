import type { UserRole } from "@/lib/types";

// Roles that carry department-head powers (the composite role inherits them).
const DEPT_HEAD_ROLES: readonly UserRole[] = [
  "department_head",
  "department_admin_and_department_head",
] as const;

// Roles that carry department-admin powers (the composite role inherits them).
const DEPT_ADMIN_ROLES: readonly UserRole[] = [
  "department_admin",
  "department_admin_and_department_head",
] as const;

// Roles that can fully manage attendance/DTR (read all, manual entry, imports,
// deletes). "dtr_manager" is a dedicated role with the same attendance reach as
// super_admin / hr_admin but no other admin powers.
const ATTENDANCE_MANAGER_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
  "dtr_manager",
] as const;

export function isAttendanceManager(
  role: UserRole | null | undefined,
): boolean {
  return !!role && ATTENDANCE_MANAGER_ROLES.includes(role);
}

// Roles that can manage work schedules. Schedules are an attendance concern, so
// the dedicated DTR Manager role gets access alongside super_admin (other
// Administration tools stay super_admin-only).
const SCHEDULE_MANAGER_ROLES: readonly UserRole[] = [
  "super_admin",
  "dtr_manager",
] as const;

export function canManageSchedules(
  role: UserRole | null | undefined,
): boolean {
  return !!role && SCHEDULE_MANAGER_ROLES.includes(role);
}

export function isDeptHead(role: UserRole | null | undefined): boolean {
  return !!role && DEPT_HEAD_ROLES.includes(role);
}

export function isDeptAdmin(role: UserRole | null | undefined): boolean {
  return !!role && DEPT_ADMIN_ROLES.includes(role);
}

export function isDeptScoped(role: UserRole | null | undefined): boolean {
  return isDeptHead(role) || isDeptAdmin(role);
}

// Roles allowed to set an employee's "Detailed To" department through the quick
// modal on the employees list. This is a narrow, single-field edit (it drives
// the DTR signatory — see src/lib/dtr-signatory.ts). Department-scoped editors
// are restricted to their own department; super_admin and OCM Admin can set it
// for employees in any department.
const DETAILED_DEPT_EDITOR_ROLES: readonly UserRole[] = [
  "super_admin",
  "department_admin",
  "department_admin_and_department_head",
  "ocm_admin",
] as const;

export function canEditDetailedDepartment(
  role: UserRole | null | undefined,
): boolean {
  return !!role && DETAILED_DEPT_EDITOR_ROLES.includes(role);
}

// super_admin (full employee editing) and OCM Admin (manages employees detailed
// to the Office of the City Mayor) may set the "Detailed To" department for
// employees in ANY department — unlike the department-scoped editors, who are
// limited to their own department.
export function canEditDetailedDepartmentAnyDept(
  role: UserRole | null | undefined,
): boolean {
  return role === "super_admin" || role === "ocm_admin";
}

// The composite "Dept Admin + Head" role. Acts as a dept-head approver but
// is granted cross-department reach within the Leave module specifically —
// e.g. they can file leave for any employee and approve at the dept-head
// step regardless of which department the employee belongs to.
export function isCompositeDeptAdminHead(
  role: UserRole | null | undefined,
): boolean {
  return role === "department_admin_and_department_head";
}

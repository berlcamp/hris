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

export function isDeptHead(role: UserRole | null | undefined): boolean {
  return !!role && DEPT_HEAD_ROLES.includes(role);
}

export function isDeptAdmin(role: UserRole | null | undefined): boolean {
  return !!role && DEPT_ADMIN_ROLES.includes(role);
}

export function isDeptScoped(role: UserRole | null | undefined): boolean {
  return isDeptHead(role) || isDeptAdmin(role);
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

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

// Roles with full HR records reach: create/edit employees and their records,
// manage the plantilla, manage the salary grade table, work the NOSI module,
// and view the employee QR code. "hr_record_manager" is a dedicated role limited
// to exactly this reach — it has NO access to attendance/DTR, leave, CTO/COC,
// RSP, payroll, reports, or any other administration tool.
const HR_RECORDS_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
  "hr_record_manager",
] as const;

export function canManageHrRecords(
  role: UserRole | null | undefined,
): boolean {
  return !!role && HR_RECORDS_ROLES.includes(role);
}

// Roles allowed to EDIT the salary grade table. The HR Record Manager reaches
// the Salary Grades page (see canManageHrRecords) but is restricted to viewing
// only — creating/updating/deleting/importing entries stays with the full HR
// admins.
const SALARY_GRADE_EDITOR_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
] as const;

export function canManageSalaryGrades(
  role: UserRole | null | undefined,
): boolean {
  return !!role && SALARY_GRADE_EDITOR_ROLES.includes(role);
}

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

// Roles that can record and correct attendance by hand. Wider than
// ATTENDANCE_MANAGER_ROLES because OCM Admin files and fixes entries across
// departments, but narrower in reach than the manager roles: OCM Admin gets
// neither the Dahua biometric import nor entry deletion (both stay on
// isAttendanceManager).
const MANUAL_ENTRY_ROLES: readonly UserRole[] = [
  ...ATTENDANCE_MANAGER_ROLES,
  "ocm_admin",
] as const;

export function canManualEntry(role: UserRole | null | undefined): boolean {
  return !!role && MANUAL_ENTRY_ROLES.includes(role);
}

// Roles that can generate DTRs (individual + bulk) for employees in ANY
// department. Wider than ATTENDANCE_MANAGER_ROLES because OCM Admin needs to
// print DTRs across departments without gaining manual entry, biometric import
// or delete rights.
const DTR_PRINTER_ROLES: readonly UserRole[] = [
  ...ATTENDANCE_MANAGER_ROLES,
  "ocm_admin",
] as const;

export function canPrintDtr(role: UserRole | null | undefined): boolean {
  return !!role && DTR_PRINTER_ROLES.includes(role);
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

// Roles allowed to open the Attendance & DTR module at all. Department-scoped
// roles (department_head, department_admin and the composite) are deliberately
// excluded — they have no access to attendance/DTR.
const ATTENDANCE_ACCESS_ROLES: readonly UserRole[] = [
  "super_admin",
  "ocm_admin",
  "hr_admin",
  "employee",
  "dtr_manager",
] as const;

export function canAccessAttendance(
  role: UserRole | null | undefined,
): boolean {
  return !!role && ATTENDANCE_ACCESS_ROLES.includes(role);
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
// are restricted to their own department; super_admin, OCM Admin and DTR
// Manager can set it for employees in any department.
const DETAILED_DEPT_EDITOR_ROLES: readonly UserRole[] = [
  "super_admin",
  "department_admin",
  "department_admin_and_department_head",
  "ocm_admin",
  "dtr_manager",
] as const;

export function canEditDetailedDepartment(
  role: UserRole | null | undefined,
): boolean {
  return !!role && DETAILED_DEPT_EDITOR_ROLES.includes(role);
}

// super_admin (full employee editing), OCM Admin (manages employees detailed to
// the Office of the City Mayor) and DTR Manager (manages DTRs across all
// departments) may set the "Detailed To" department for employees in ANY
// department — unlike the department-scoped editors, who are limited to their
// own department.
export function canEditDetailedDepartmentAnyDept(
  role: UserRole | null | undefined,
): boolean {
  return (
    role === "super_admin" || role === "ocm_admin" || role === "dtr_manager"
  );
}

// Roles that can manage the Job Orders module: JO employees, Area Assignments,
// and (from Specs 2 and 3) payrolls, memos and special orders. "jo_manager" is
// a dedicated role with no reach outside Job Orders. super_admin and hr_admin
// are included because they hold this access today via `canManageJobOrders`
// itself, gating `/job-orders/payroll` — this preserves it rather than
// silently removing it.
const JOB_ORDER_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
  "jo_manager",
] as const;

export function canManageJobOrders(
  role: UserRole | null | undefined,
): boolean {
  return !!role && JOB_ORDER_ROLES.includes(role);
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

// Roles that manage the Contract of Service module: the COS employee registry,
// contracts and renewals, contract templates, and COS payroll. "cos_manager" is
// a dedicated role limited to exactly this reach — it has NO access to
// plantilla employees, attendance/DTR, leave, CTO/COC, RSP, regular or JO
// payroll, reports, or any other administration tool. hr_admin is included to
// preserve the access it holds today under the /cos-payroll guard.
const COS_MANAGER_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
  "cos_manager",
] as const;

export function canManageCos(role: UserRole | null | undefined): boolean {
  return !!role && COS_MANAGER_ROLES.includes(role);
}

// Roles that may create and edit contract TEMPLATES — the reusable legal
// boilerplate. Narrower than canManageCos on purpose: COS-1's requested
// permission list separated "Manage Templates" / "Edit Templates" from "Create
// Contracts", so a cos_manager USES templates when drafting a contract but
// cannot rewrite the boilerplate. Mirrors canManageSalaryGrades, where
// hr_record_manager reaches the page but cannot edit the table.
const COS_TEMPLATE_EDITOR_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
] as const;

export function canManageCosTemplates(
  role: UserRole | null | undefined,
): boolean {
  return !!role && COS_TEMPLATE_EDITOR_ROLES.includes(role);
}

// Roles that may FILE an attendance correction request. Deliberately narrow:
// department-scoped roles stay out of ATTENDANCE_ACCESS_ROLES, so filing a
// correction grants no access to the Dahua importer, bulk DTR generation or
// entry deletion. Their reach is further limited to employees whose EFFECTIVE
// department (detailed_department_id ?? department_id) is their own AND who
// carry employees.attendance_correction_eligible.
const CORRECTION_REQUESTER_ROLES: readonly UserRole[] = [
  "department_admin",
  "department_admin_and_department_head",
] as const;

export function canRequestAttendanceCorrection(
  role: UserRole | null | undefined,
): boolean {
  return !!role && CORRECTION_REQUESTER_ROLES.includes(role);
}

// Roles that approve or reject a correction. Nothing a requester files reaches
// a DTR without one of these roles approving it, so the two sets must not
// overlap.
const CORRECTION_REVIEWER_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
  "dtr_manager",
] as const;

export function canReviewAttendanceCorrection(
  role: UserRole | null | undefined,
): boolean {
  return !!role && CORRECTION_REVIEWER_ROLES.includes(role);
}

// Roles that may flag an employee as correction-eligible. Same set as the
// reviewers: deciding WHO can be corrected is the same authority as deciding
// WHAT gets corrected.
export function canFlagCorrectionEligible(
  role: UserRole | null | undefined,
): boolean {
  return !!role && CORRECTION_REVIEWER_ROLES.includes(role);
}

import type { UserRole } from "@/lib/types";

// ── Multiple roles per account ────────────────────────────────────────────
//
// An account holds a SET of roles (user_profiles.roles, migration 087), not
// one. Every helper below therefore takes `RoleInput`: a single role, a list of
// them, or null. Passing a list is the normal case — `getServerUser()` and
// `getCurrentUser()` both return `roles` — and passing one role still works, so
// a call site that has only a role in hand does not have to invent an array.
//
// The rule the whole file follows: a GRANT is the UNION over the account's
// roles. Holding two roles can only ever add powers, never remove one. The
// per-account switches (corrections, module payroll) are the single exception
// and they qualify one role's grant rather than the account — see
// correctionsSwitchOn / modulePayrollSwitchOn.
export type RoleInput = UserRole | readonly UserRole[] | null | undefined;

/** Normalizes whatever a call site holds into a plain list of roles. */
export function toRoleList(input: RoleInput): readonly UserRole[] {
  if (!input) return [];
  return typeof input === "string" ? [input] : input;
}

/** Does the account hold EVERY one of these roles? */
export function hasEveryRole(
  input: RoleInput,
  ...wanted: readonly UserRole[]
): boolean {
  const held = toRoleList(input);
  return wanted.every((w) => held.includes(w));
}

/** Does the account hold ANY of these roles? This is what a grant asks. */
export function hasAnyRole(
  input: RoleInput,
  ...wanted: readonly UserRole[]
): boolean {
  const held = toRoleList(input);
  return wanted.some((w) => held.includes(w));
}

/** Does the account hold this exact role? */
export function hasRole(input: RoleInput, wanted: UserRole): boolean {
  return toRoleList(input).includes(wanted);
}

/**
 * Reads a `roles` value straight off a user_profiles row into a usable list.
 *
 * `user_profiles.roles` is NOT NULL from migration 087 on, but the fallback
 * matters anyway: a select written before that migration, a cached row, or a
 * partially-typed client all hand back an absent array, and an account with no
 * roles fails every permission check silently. Falling back to the scalar
 * `role` gives such a row exactly the access it had before the array existed.
 */
export function normalizeRoles(
  roles: unknown,
  fallbackRole: string | null | undefined,
): UserRole[] {
  const list = Array.isArray(roles)
    ? roles.filter((r): r is UserRole => typeof r === "string" && r.length > 0)
    : [];
  if (list.length > 0) return list;
  return fallbackRole ? [fallbackRole as UserRole] : [];
}

// Widest data reach first. Mirrored by hris.user_role_rank in migration 087 —
// change both together.
//
// This ordering decides the PRIMARY role, which is what user_profiles.role
// stores and what the handful of "how much data does this account see" branches
// read (own record / own department / everything). Ranking by reach means a
// multi-role account is scoped by its widest role: an HR Admin who is also a
// Department Head sees every department, and a Department Admin who also runs
// Job Orders is still scoped to their department for leave. Ranking any other
// way would either hide data an account is entitled to or hand a narrow role
// the run of the system.
export const ROLE_PRECEDENCE: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
  "ocm_admin",
  "dtr_manager",
  "hr_record_manager",
  "department_admin_and_department_head",
  "department_head",
  "department_admin",
  "jo_manager",
  "cos_manager",
  "event_attendance_officer",
  "employee",
] as const;

/**
 * The account's primary role: the widest-reaching role it holds. Equals
 * user_profiles.role, which the database keeps in step with the array.
 *
 * Use this ONLY to decide scope (whose records does this account see). For
 * "may this account do X", pass the whole `roles` array to the grant helpers —
 * a power the account holds through a narrower role must not vanish because a
 * wider role sorts ahead of it.
 */
export function primaryRole(input: RoleInput): UserRole | null {
  const held = toRoleList(input);
  if (held.length === 0) return null;
  let best: UserRole | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const role of held) {
    const rank = ROLE_PRECEDENCE.indexOf(role);
    const effective = rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
    if (effective < bestRank) {
      bestRank = effective;
      best = role;
    }
  }
  return best;
}

/**
 * True only for an account whose ONE role is the scan-only Attendance Checker.
 *
 * The Checker is redirected out of the dashboard to /scan, and that redirect
 * must not catch an account that merely helps at a door on top of a real job —
 * it would lock them out of every other module they hold. Deliberately not
 * expressed through primaryRole: "employee" ranks below the Checker, so a
 * Checker who is also an Employee would still have been redirected.
 */
export function isScanOnlyAccount(input: RoleInput): boolean {
  const held = toRoleList(input);
  return held.length === 1 && held[0] === "event_attendance_officer";
}

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
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => HR_RECORDS_ROLES.includes(r));
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
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => SALARY_GRADE_EDITOR_ROLES.includes(r));
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
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => ATTENDANCE_MANAGER_ROLES.includes(r));
}

// Recording attendance by hand is no longer a separate power: the Manual
// Attendance Entry module was retired in favour of direct-apply corrections.
// canManualEntry and MANUAL_ENTRY_ROLES lived here and were exactly
// ATTENDANCE_MANAGER_ROLES + ocm_admin — the same set as
// CORRECTION_DIRECT_APPLY_ROLES below, so nobody gained or lost the ability.
// Use canDirectApplyAttendanceCorrection instead.

// Roles that can generate DTRs (individual + bulk) for employees in ANY
// department. Wider than ATTENDANCE_MANAGER_ROLES because OCM Admin needs to
// print DTRs across departments without gaining manual entry, biometric import
// or delete rights.
const DTR_PRINTER_ROLES: readonly UserRole[] = [
  ...ATTENDANCE_MANAGER_ROLES,
  "ocm_admin",
] as const;

export function canPrintDtr(role: RoleInput): boolean {
  return toRoleList(role).some((r) => DTR_PRINTER_ROLES.includes(r));
}

// Roles that can manage work schedules. Schedules are an attendance concern, so
// the dedicated DTR Manager role gets access alongside super_admin (other
// Administration tools stay super_admin-only).
const SCHEDULE_MANAGER_ROLES: readonly UserRole[] = [
  "super_admin",
  "dtr_manager",
] as const;

export function canManageSchedules(
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => SCHEDULE_MANAGER_ROLES.includes(r));
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
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => ATTENDANCE_ACCESS_ROLES.includes(r));
}

export function isDeptHead(role: RoleInput): boolean {
  return toRoleList(role).some((r) => DEPT_HEAD_ROLES.includes(r));
}

export function isDeptAdmin(role: RoleInput): boolean {
  return toRoleList(role).some((r) => DEPT_ADMIN_ROLES.includes(r));
}

export function isDeptScoped(role: RoleInput): boolean {
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
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => DETAILED_DEPT_EDITOR_ROLES.includes(r));
}

// super_admin (full employee editing), OCM Admin (manages employees detailed to
// the Office of the City Mayor) and DTR Manager (manages DTRs across all
// departments) may set the "Detailed To" department for employees in ANY
// department — unlike the department-scoped editors, who are limited to their
// own department.
export function canEditDetailedDepartmentAnyDept(
  role: RoleInput,
): boolean {
  return hasAnyRole(role, "super_admin", "ocm_admin", "dtr_manager");
}

// Who may open the Monthly DTR module (/dtr) at all. It is open to every
// signed-in role EXCEPT the two module-scoped manager roles: a JO Manager and a
// COS Manager administer their own registry and have no reach into plantilla
// attendance — not even their own DTR, since neither role belongs to the
// plantilla roster. Everyone else keeps the tier canSelectDtrDepartment /
// isDeptScoped assigns them.
const DTR_EXCLUDED_ROLES: readonly UserRole[] = [
  "jo_manager",
  "cos_manager",
] as const;

export function canAccessDtr(role: RoleInput): boolean {
  // An account reaches /dtr as long as ONE of its roles is not excluded:
  // a JO Manager who is also an Employee still has their own DTR.
  return toRoleList(role).some((r) => !DTR_EXCLUDED_ROLES.includes(r));
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
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => JOB_ORDER_ROLES.includes(r));
}

// Payroll WRITE access inside a module a manager role owns, settable per
// account: user_profiles.can_manage_module_payroll (migration 077), edited
// from /admin/users. The role decides which module the account reaches; this
// decides whether payroll inside it is editable or read-only.
//
// Like CorrectionActor above, the helper takes the USER rather than the role
// so a call site cannot read the power off the role alone and silently skip
// the flag.
const MODULE_PAYROLL_MANAGER_ROLES: readonly UserRole[] = [
  "jo_manager",
  "cos_manager",
] as const;

export interface ModulePayrollActor {
  roles: RoleInput;
  canManageModulePayroll?: boolean | null;
}

// False only for a module-manager account whose switch is off. Undefined/null
// read as ON so a caller holding a user object from before migration 077 — or
// any partial shape — keeps the access the role grants.
function modulePayrollSwitchOn(actor: ModulePayrollActor): boolean {
  if (!toRoleList(actor.roles).some((r) => MODULE_PAYROLL_MANAGER_ROLES.includes(r))) {
    return true;
  }
  return actor.canManageModulePayroll !== false;
}

/**
 * May this account create, edit or duplicate a Job Order payroll, and
 * add/edit/remove its members?
 *
 * Reading a payroll is NOT gated by this — a JO Manager with the switch off
 * still opens the list and detail pages and still prints. super_admin and
 * hr_admin are unaffected. Deleting remains super_admin-only via
 * canDeletePayroll, which this does not widen.
 */
export function canManageJobOrderPayroll(actor: ModulePayrollActor): boolean {
  // The switch qualifies the MODULE-MANAGER grant, not the account. An account
  // that also holds super_admin or hr_admin manages payroll through that role
  // and the switch never applied to it — turning it off for the JO Manager hat
  // must not take away the HR Admin one.
  if (hasAnyRole(actor.roles, "super_admin", "hr_admin")) return true;
  return canManageJobOrders(actor.roles) && modulePayrollSwitchOn(actor);
}

// The composite "Dept Admin + Head" role. Acts as a dept-head approver but
// is granted cross-department reach within the Leave module specifically —
// e.g. they can file leave for any employee and approve at the dept-head
// step regardless of which department the employee belongs to.
export function isCompositeDeptAdminHead(
  role: RoleInput,
): boolean {
  return hasRole(role, "department_admin_and_department_head");
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

export function canManageCos(role: RoleInput): boolean {
  return toRoleList(role).some((r) => COS_MANAGER_ROLES.includes(r));
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
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => COS_TEMPLATE_EDITOR_ROLES.includes(r));
}

// Roles that may FILE an attendance correction request. Deliberately narrow:
// department-scoped roles stay out of ATTENDANCE_ACCESS_ROLES, so filing a
// correction grants no access to the Dahua importer, bulk DTR generation or
// entry deletion. Their reach is limited to employees whose EFFECTIVE
// department (detailed_department_id ?? department_id) is their own, and to
// duty dates inside the payroll months still being closed (see
// src/lib/correction-window.ts).
const CORRECTION_REQUESTER_ROLES: readonly UserRole[] = [
  "department_admin",
  "department_admin_and_department_head",
] as const;

// The corrections helpers below take the USER, not just the role, because a
// Department Admin's access is settable per account: user_profiles
// .can_access_attendance_corrections (migration 076), edited from
// /admin/users. Every other role's access is decided by role alone — the flag
// is read only for the dept-admin roles, which are the only ones the
// Administration form offers it for.
//
// Taking the whole user is deliberate: a role-only signature would let a call
// site read the power off the role and silently skip the flag. The type makes
// that impossible to forget. Pass the object from getCurrentUser/getServerUser
// as-is.
export interface CorrectionActor {
  roles: RoleInput;
  canAccessAttendanceCorrections?: boolean | null;
}

// False only for a dept-admin account whose switch is off. Undefined/null read
// as ON so a caller holding a user object from before migration 076 — or any
// partial shape — keeps the access the role grants.
function correctionsSwitchOn(actor: CorrectionActor): boolean {
  if (!isDeptAdmin(actor.roles)) return true;
  return actor.canAccessAttendanceCorrections !== false;
}

export function canRequestAttendanceCorrection(actor: CorrectionActor): boolean {
  // A reviewer is deliberately NOT a requester, even when the account also
  // holds a requester role. The two sets must stay disjoint — nothing a
  // requester files may reach a DTR without a second party approving it — and
  // an account that holds both loses nothing: canDirectApplyAttendanceCorrection
  // already lets it record the same correction outright.
  if (canReviewAttendanceCorrection(actor.roles)) return false;

  return (
    toRoleList(actor.roles).some((r) => CORRECTION_REQUESTER_ROLES.includes(r)) &&
    correctionsSwitchOn(actor)
  );
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
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => CORRECTION_REVIEWER_ROLES.includes(r));
}

// canFlagCorrectionEligible lived here. The per-employee
// attendance_correction_eligible flag it gated is gone (migration 069): a
// Department Admin now reaches every active employee in their effective
// department, bounded by the payroll-month window in
// src/lib/correction-window.ts rather than by a whitelist HR had to maintain.

// Roles that may file a correction that applies IMMEDIATELY — no second party,
// no proof, any active employee. The reviewers, plus OCM Admin, which records
// attendance across departments and would otherwise have no way to do so once
// the Manual Attendance Entry module is retired.
//
// This is deliberately a THIRD set rather than a widening of
// CORRECTION_REQUESTER_ROLES. Those two sets must stay disjoint: a department
// admin filing a request must never be able to approve it. Direct-apply is not
// self-approval — it is the same authority that would have approved the request
// choosing to skip a step it was always allowed to take, and it is exactly the
// authority those roles already exercise through manual attendance entry.
const CORRECTION_DIRECT_APPLY_ROLES: readonly UserRole[] = [
  ...CORRECTION_REVIEWER_ROLES,
  "ocm_admin",
] as const;

export function canDirectApplyAttendanceCorrection(
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => CORRECTION_DIRECT_APPLY_ROLES.includes(r));
}

// --- DTR module (/dtr) ---
//
// This replaced the Weekly DTR module, which granted the same one verb over a
// Monday–Sunday week and whose canDownloadWeeklyDtr helper lived here. The
// department-scoped roles it served are now the middle tier below, so they kept
// their reach — a whole month rather than a single week.
//
// /dtr is open to EVERY signed-in role, so there is no "can access" helper for
// it: the two below decide how much of it a role gets, and everyone who matches
// neither falls through to their own DTR. That is the whole authorization
// model, and it is enforced server-side in src/lib/actions/dtr-actions.ts:
//
//   canSelectDtrDepartment  -> any department, any month
//   isDeptScoped            -> own department only, recent months only
//   everyone else           -> own DTR only, recent months only
//
// "Recent months" is the current one plus the two before it — OPEN_MONTH_COUNT
// in src/lib/actions/dtr-actions.ts is the single place that number lives.

// Roles that pick which department to download and are not held to the recent-
// month window. Deliberately NOT the same set as canPrintDtr, which also
// contains ocm_admin — the monthly module was specified for these three. Adding
// "ocm_admin" here is the one-line change if OCM Admin should match the reach
// it already has in Bulk DTR.
const DTR_ANY_DEPARTMENT_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
  "dtr_manager",
] as const;

export function canSelectDtrDepartment(
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => DTR_ANY_DEPARTMENT_ROLES.includes(r));
}

// Who sees the "Import from Dahua device" button ON /dtr. This is a placement
// rule, not a new power: the importer's own server actions keep gating on
// isAttendanceManager, so hr_admin still imports from /attendance — it simply
// does not get a second entry point here.
const DTR_DEVICE_IMPORT_ROLES: readonly UserRole[] = [
  "super_admin",
  "dtr_manager",
] as const;

export function canImportDtrDevice(
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => DTR_DEVICE_IMPORT_ROLES.includes(r));
}

// Anyone who may open the correction wizard at all, by either route. Use this
// to gate the wizard and the "New Request" button; use the two specific helpers
// to decide what the filing actually DOES.
export function canFileAttendanceCorrection(actor: CorrectionActor): boolean {
  return (
    canRequestAttendanceCorrection(actor) ||
    canDirectApplyAttendanceCorrection(actor.roles)
  );
}

// Roles that may READ their own department's corrections but file nothing. A
// Department Head answers for the attendance their department admin files
// against, so they need to see what was filed and how HR decided it — but the
// filing stays with the admin and the approving stays with HR.
//
// Deliberately a FOURTH set rather than a widening of
// CORRECTION_REQUESTER_ROLES: membership there hands out the wizard, the
// correction window and withdrawal, none of which belong to a viewer.
const CORRECTION_VIEWER_ROLES: readonly UserRole[] = ["department_head"] as const;

export function canViewAttendanceCorrections(
  role: RoleInput,
): boolean {
  return toRoleList(role).some((r) => CORRECTION_VIEWER_ROLES.includes(r));
}

// Anyone whose reach over corrections stops at their OWN department — the
// department-scoped filers plus the read-only viewers. Reviewers see every
// department and are deliberately not here; actions branch on
// canReviewAttendanceCorrection first, then fall back to this with a
// department_id filter.
export function canReadOwnDeptCorrections(actor: CorrectionActor): boolean {
  return (
    canRequestAttendanceCorrection(actor) ||
    canViewAttendanceCorrections(actor.roles)
  );
}

// Anyone who may open the /attendance-corrections route at all. Use this for
// route and nav gating — it is the union of every side of the workflow,
// including the viewers who can do nothing there but look.
export function canOpenAttendanceCorrections(actor: CorrectionActor): boolean {
  return (
    canFileAttendanceCorrection(actor) ||
    canReviewAttendanceCorrection(actor.roles) ||
    canViewAttendanceCorrections(actor.roles)
  );
}

// ── Events ────────────────────────────────────────────────────────────────
// Roles that manage events end to end: create/edit/open/close, build rosters,
// print QR cards, read attendance reports. Reporting is HR-only in v1 — a
// department head would see a roster with every Job Order attendee missing
// (job_order_employees has no department_id at all) and no way to tell that
// from a bug.
const EVENT_MANAGER_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
] as const;

export function canManageEvents(role: RoleInput): boolean {
  return toRoleList(role).some((r) => EVENT_MANAGER_ROLES.includes(r));
}

/**
 * May this account record attendance at the door. The Attendance Checker
 * is scan-only and deliberately un-scoped: it may scan anyone, at any open
 * event, regardless of department. Event managers can scan too, so an admin can
 * cover a door without swapping accounts.
 */
export function canScanEvents(role: RoleInput): boolean {
  return canManageEvents(role) || hasRole(role, "event_attendance_officer");
}

/**
 * May this account open the Events module at all — never the roster editor, the
 * report, or the card printing screen, which are gated on canManageEvents.
 *
 * In practice only the managers reach the module's pages now: an Attendance
 * Checker is redirected out of the dashboard shell to its own app at /scan
 * (see src/app/(dashboard)/layout.tsx). This stays the union of both so the
 * module's own guards do not depend on that redirect being the only one.
 */
export function canAccessEvents(role: RoleInput): boolean {
  return canScanEvents(role);
}

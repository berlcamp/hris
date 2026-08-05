"use server";

// Monthly DTR (/dtr) — one calendar month of CSC Form 48 DTRs, for whoever the
// caller is accountable for.
//
// The module is open to every signed-in role, which makes the scoping rules the
// whole of its security model. There are three tiers, and each one is decided
// HERE rather than in the page or the client:
//
//   * canSelectDtrDepartment (super admin, HR admin, DTR manager) — pick any
//     department, pick any month.
//   * department-scoped roles (department admin, department head, composite) —
//     pinned to their OWN department, and to the recent-month window.
//   * everyone else, including plain employees — their own DTR only, same
//     recent-month window.
//
// The department is never taken from the client for a department-scoped caller:
// resolveScope discards whatever id the browser sent and substitutes the
// caller's own, so a hand-crafted request cannot walk the org chart. The month
// window is enforced the same way — the browser only offers the open months,
// but the server is what makes that true.
//
// This module replaced Weekly DTR, which gave the department-scoped roles the
// same single verb over a Monday–Sunday week. They kept that reach here as the
// middle tier, widened from a week to a month.
//
// The roster is the department's EFFECTIVE one (assigned plus detailed INTO it,
// via loadDtrEmployeesForDepartment), which is the same set the department
// signs DTRs for, and it is narrowed to employees who actually have attendance
// rows that month so nobody downloads a page of ABSENT rows nobody recorded.
//
// There is no write path in this file.

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canSelectDtrDepartment, isDeptScoped } from "@/lib/auth-helpers";
import {
  buildDtrResults,
  employeesWithAttendance,
  loadDtrEmployeesForDepartment,
  DTR_EMPLOYEE_SELECT,
  type BulkDtrResult,
  type DtrEmployeeRow,
  type DtrSignatoryDeptRow,
} from "@/lib/dtr-builder";
import { manilaToday } from "@/lib/format-date";
import {
  endOfMonth,
  isMonthKey,
  shiftMonths,
  startOfMonth,
  toMonthKey,
} from "@/lib/month-range";

export interface MonthlyDtrDepartment {
  id: string;
  name: string;
  code: string;
}

export interface MonthlyDtrEmployee {
  id: string;
  name: string;
  position: string | null;
}

export interface MonthlyDtrRoster {
  department: MonthlyDtrDepartment | null;
  /** Only employees whose DTR for the month is available — i.e. has time entries. */
  employees: MonthlyDtrEmployee[];
}

type AdminClient = ReturnType<typeof createAdminClient>;

interface MonthlyDtrScope {
  supabase: AdminClient;
  departmentId: string;
  startDate: string;
  endDate: string;
}

/**
 * How many months a restricted caller may reach, counting the current one — so
 * 3 means "this month and the two before it". One constant, because the picker
 * the browser renders and the check the server enforces must never disagree.
 */
const OPEN_MONTH_COUNT = 3;

/**
 * The months a restricted caller may download, newest first.
 *
 * Manila, not the server's clock: a UTC host is still on the previous day for
 * the first eight hours of every Philippine day, which on the 1st of a month
 * would silently offer the wrong set.
 */
function allowedMonths(): string[] {
  const current = toMonthKey(manilaToday());
  return Array.from({ length: OPEN_MONTH_COUNT }, (_, back) =>
    shiftMonths(current, -back),
  );
}

/** The month window, as the page needs it to build the picker. */
export async function getSelectableMonths(): Promise<string[]> {
  return allowedMonths();
}

/**
 * Reject a month the caller may not ask for. `anyMonth` callers still get the
 * format check — a malformed key would otherwise reach `endOfMonth` and throw
 * something meaningless to the user.
 */
function assertMonthAllowed(month: string, anyMonth: boolean): void {
  if (!isMonthKey(month)) {
    throw new Error("Select a valid month");
  }
  if (anyMonth) return;
  if (!allowedMonths().includes(month)) {
    throw new Error(
      "You may only download the current month or the two months before it.",
    );
  }
}

/**
 * Authorize the caller, decide which department they are actually asking about,
 * and turn the month key into a date range.
 *
 * This is the security boundary for every department-wide action in this file:
 * enforced once, here, rather than re-checked in each action.
 */
async function resolveScope(
  requestedDepartmentId: string | null,
  month: string,
): Promise<MonthlyDtrScope> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const anyDepartment = canSelectDtrDepartment(user.role);
  assertMonthAllowed(month, anyDepartment);

  let departmentId: string;
  if (anyDepartment) {
    if (!requestedDepartmentId) throw new Error("Select a department first");
    departmentId = requestedDepartmentId;
  } else if (isDeptScoped(user.role)) {
    if (!user.departmentId) {
      throw new Error(
        "Your account is not assigned to a department, so there is no roster to generate.",
      );
    }
    // The requested id is discarded on purpose — see the file header.
    departmentId = user.departmentId;
  } else {
    // Employees and the roles with no departmental accountability reach their
    // own DTR through getMyMonthlyDtr, never a department roster.
    throw new Error("Unauthorized");
  }

  return {
    supabase: createAdminClient(),
    departmentId,
    startDate: startOfMonth(month),
    endDate: endOfMonth(month),
  };
}

async function loadDepartment(
  supabase: AdminClient,
  departmentId: string,
): Promise<DtrSignatoryDeptRow | null> {
  const { data } = await supabase
    .schema("hris")
    .from("departments")
    .select("id, name, code")
    .eq("id", departmentId)
    .maybeSingle();
  return (data as DtrSignatoryDeptRow | null) ?? null;
}

/**
 * The department's roster for the month, already narrowed to employees whose
 * DTR is available. Everything downstream reuses this rather than re-deriving
 * the roster, so "who may I download" and "who did I just download" can never
 * disagree.
 */
async function loadAvailable(
  scope: MonthlyDtrScope,
): Promise<DtrEmployeeRow[]> {
  const all = await loadDtrEmployeesForDepartment(
    scope.supabase,
    scope.departmentId,
  );
  const withLogs = await employeesWithAttendance(
    scope.supabase,
    all.map((e) => e.id),
    scope.startDate,
    scope.endDate,
  );
  return all.filter((e) => withLogs.has(e.id));
}

function positionOf(emp: DtrEmployeeRow): string | null {
  return emp.positions?.title ?? emp.plantilla?.[0]?.position_title ?? null;
}

/** Who has a downloadable DTR this month — drives the availability count. */
export async function getMonthlyDtrRoster(
  departmentId: string | null,
  month: string,
): Promise<MonthlyDtrRoster> {
  const scope = await resolveScope(departmentId, month);
  const [department, employees] = await Promise.all([
    loadDepartment(scope.supabase, scope.departmentId),
    loadAvailable(scope),
  ]);

  return {
    department,
    employees: employees.map((emp) => ({
      id: emp.id,
      name: `${emp.last_name}, ${emp.first_name}`,
      position: positionOf(emp),
    })),
  };
}

/** Every available DTR in the department for the month, as one PDF payload. */
export async function getMonthlyDtrBulk(
  departmentId: string | null,
  month: string,
): Promise<{
  department: MonthlyDtrDepartment | null;
  results: BulkDtrResult[];
}> {
  const scope = await resolveScope(departmentId, month);
  const [department, employees] = await Promise.all([
    loadDepartment(scope.supabase, scope.departmentId),
    loadAvailable(scope),
  ]);

  const results = await buildDtrResults(
    scope.supabase,
    employees,
    scope.startDate,
    scope.endDate,
    department,
  );

  return { department, results };
}

/**
 * The caller's OWN DTR for the month — the tier every role that is neither a
 * DTR administrator nor departmentally accountable lands on.
 *
 * The employee is found by user_profile_id, so there is no id to tamper with:
 * the caller cannot express "someone else" in this call at all. The month
 * window still applies, and callers who may select any month keep that freedom
 * here too rather than being narrowed by which button they pressed.
 *
 * No signatory override is passed: an individual export is not tied to a
 * department being printed, so the employee's own effective department stands —
 * the same rule getEmployeeDtrRange follows.
 */
export async function getMyMonthlyDtr(
  month: string,
): Promise<BulkDtrResult | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  assertMonthAllowed(month, canSelectDtrDepartment(user.role));

  const supabase = createAdminClient();
  const { data } = await supabase
    .schema("hris")
    .from("employees")
    .select(DTR_EMPLOYEE_SELECT)
    .eq("user_profile_id", user.id)
    .maybeSingle();

  if (!data) return null;
  const emp = data as unknown as DtrEmployeeRow;

  const startDate = startOfMonth(month);
  const endDate = endOfMonth(month);

  // Same availability rule as the department roster: nothing recorded means
  // there is no DTR to hand over, rather than a month of ABSENT rows.
  const withLogs = await employeesWithAttendance(
    supabase,
    [emp.id],
    startDate,
    endDate,
  );
  if (!withLogs.has(emp.id)) return null;

  const [result] = await buildDtrResults(
    supabase,
    [emp],
    startDate,
    endDate,
    null,
  );
  return result ?? null;
}

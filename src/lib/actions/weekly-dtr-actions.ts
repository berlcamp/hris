"use server";

// Weekly DTR — a department's own view of its finished attendance.
//
// The Attendance & DTR module is closed to the department-scoped roles on
// purpose (see canAccessAttendance): it carries the biometric importer, entry
// deletion, schedule management and arbitrary date ranges. A department admin
// nonetheless needs the DTRs of the people they are accountable for, so this
// module hands them exactly that and nothing adjacent:
//
//   * one unit — a Monday–Sunday week, never a free-form range;
//   * one verb — download; there is no write path in this file;
//   * one scope — the department's EFFECTIVE roster, employees assigned to it
//     plus employees detailed INTO it, which is the same set the department
//     signs DTRs for;
//   * only where attendance exists — an employee with no logs that week has no
//     DTR to download, rather than a page of ABSENT rows nobody recorded.
//
// The department is NEVER taken from the client for a department-scoped caller.
// resolveScope pins them to their own department and discards whatever id the
// browser sent, so a hand-crafted request cannot walk the org chart. HR and
// super admins, who already reach every DTR through canPrintDtr, are the only
// callers whose department argument is honoured.

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canDownloadWeeklyDtr, isDeptScoped } from "@/lib/auth-helpers";
import {
  buildDtrResults,
  employeesWithAttendance,
  loadDtrEmployeesForDepartment,
  type BulkDtrResult,
  type DtrEmployeeRow,
  type DtrSignatoryDeptRow,
} from "@/lib/dtr-builder";
import { endOfWeek, isWeekStart } from "@/lib/week-range";

export interface WeeklyDtrDepartment {
  id: string;
  name: string;
  code: string;
}

export interface WeeklyDtrEmployee {
  id: string;
  name: string;
  position: string | null;
}

export interface WeeklyDtrRoster {
  department: WeeklyDtrDepartment | null;
  /** Only employees whose DTR for the week is available — i.e. has time entries. */
  employees: WeeklyDtrEmployee[];
}

type AdminClient = ReturnType<typeof createAdminClient>;

interface WeeklyDtrScope {
  supabase: AdminClient;
  departmentId: string;
  startDate: string;
  endDate: string;
}

/**
 * Authorize the caller, decide which department they are actually asking about,
 * and turn the week start into a range.
 *
 * A department-scoped caller's own department always wins over
 * `requestedDepartmentId`. That is the security boundary of this module: it is
 * enforced here, once, rather than being re-checked in each action.
 */
async function resolveScope(
  requestedDepartmentId: string | null,
  weekStart: string,
): Promise<WeeklyDtrScope> {
  const user = await getCurrentUser();
  if (!user || !canDownloadWeeklyDtr(user.role)) {
    throw new Error("Unauthorized");
  }

  if (!isWeekStart(weekStart)) {
    // The browser only ever sends a Monday; anything else is a malformed or
    // hand-edited request, and accepting it would silently produce a "week"
    // that straddles two.
    throw new Error("A week must start on a Monday");
  }

  let departmentId: string;
  if (isDeptScoped(user.role)) {
    if (!user.departmentId) {
      throw new Error(
        "Your account is not assigned to a department, so there is no roster to generate.",
      );
    }
    departmentId = user.departmentId;
  } else {
    if (!requestedDepartmentId) throw new Error("Select a department first");
    departmentId = requestedDepartmentId;
  }

  return {
    supabase: createAdminClient(),
    departmentId,
    startDate: weekStart,
    endDate: endOfWeek(weekStart),
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
 * The department's roster for the week, already narrowed to employees whose DTR
 * is available. Everything downstream reuses this rather than re-deriving the
 * roster, so "who may I download" and "who did I just download" can never
 * disagree.
 */
async function loadAvailable(
  scope: WeeklyDtrScope,
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

/** Who has a downloadable DTR for this week — drives the employee picker. */
export async function getWeeklyDtrRoster(
  departmentId: string | null,
  weekStart: string,
): Promise<WeeklyDtrRoster> {
  const scope = await resolveScope(departmentId, weekStart);
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

/** Every available DTR in the department for the week, as one PDF payload. */
export async function getWeeklyDtrBulk(
  departmentId: string | null,
  weekStart: string,
): Promise<{ department: WeeklyDtrDepartment | null; results: BulkDtrResult[] }> {
  const scope = await resolveScope(departmentId, weekStart);
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
 * One employee's DTR for the week.
 *
 * The employee is looked up THROUGH the department's available roster rather
 * than fetched by id and checked afterwards, so an employee outside the
 * caller's department and an employee with nothing recorded that week fail the
 * same way — there is no id probe that distinguishes them.
 */
export async function getWeeklyDtrForEmployee(
  departmentId: string | null,
  weekStart: string,
  employeeId: string,
): Promise<BulkDtrResult | null> {
  const scope = await resolveScope(departmentId, weekStart);
  const [department, employees] = await Promise.all([
    loadDepartment(scope.supabase, scope.departmentId),
    loadAvailable(scope),
  ]);

  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) return null;

  const [result] = await buildDtrResults(
    scope.supabase,
    [emp],
    scope.startDate,
    scope.endDate,
    department,
  );
  return result ?? null;
}

// Turning attendance rows into printable DTR pages.
//
// This used to be written twice inside attendance-actions.ts — once in
// getDepartmentDtrBulk, once in getEmployeeDtrRange — as two ~200-line copies of
// the same day loop that had already drifted in comment wording. The weekly DTR
// module would have made it three. It lives here instead, as a plain module, for
// one reason beyond de-duplication: a `"use server"` file may only export async
// functions, and everything it exports becomes a network-reachable endpoint. A
// builder that skips authorization must NOT be exported from such a file, so it
// cannot live next to the actions that call it.
//
// Nothing in here authorizes anything. Every caller decides who may see these
// employees BEFORE handing them over.

import type { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_SCHEDULE,
  hasBreak,
  lateMinutesFor,
  pmLateMinutesFor,
  trimTimeStr,
  undertimeMinutesFor,
  type ScheduleLike,
} from "@/lib/attendance-schedule";
import { getHolidayMap } from "@/lib/holiday-helpers";
import {
  resolveSignatories,
  type DtrSignatory,
  type SignatoryInput,
} from "@/lib/dtr-signatory";
import type { HolidayType } from "@/lib/validations/holiday-schema";
import {
  NO_TIME_REASON_LABELS,
  NO_TIME_REASON_SHORT,
  type NoTimeReason,
} from "@/lib/constants";

type AdminClient = ReturnType<typeof createAdminClient>;

// --- Types ---

export interface DtrEntry {
  date: string;
  day_of_week: string;
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  is_late: boolean;
  late_minutes: number;
  // True when the return from lunch (time_in_pm) was past break_end — the PM
  // arrival prints red like a late AM arrival. Absent on non-worked rows.
  is_pm_late?: boolean;
  is_undertime: boolean;
  undertime_minutes: number;
  is_absent: boolean;
  remarks: string | null;
  leave_type: string | null;
  // Declared holiday overlay for this date, if any. "full" replaces the whole
  // row with HOLIDAY; "half_am"/"half_pm" label only that half of the day.
  holiday: "full" | "half_am" | "half_pm" | null;
  holiday_name: string | null;
  // Official-duty reason a manual entry has no punches (TRAVEL / FIELD WORK /
  // OFFICIAL BUSINESS). Printed across the row like ON LEAVE when there are no
  // time entries. Legacy day-level field (migration 041).
  no_time_reason_label: string | null;
  // Per-slot official-duty reasons (migration 042) as the DTR shortcut (FW/OB/
  // TRAVEL). When set, the cell prints the shortcut instead of a time.
  reason_in_am: string | null;
  reason_out_am: string | null;
  reason_in_pm: string | null;
  reason_out_pm: string | null;
}

export interface DtrSummary {
  total_days_present: number;
  total_days_absent: number;
  total_days_on_leave: number;
  total_late_count: number;
  total_late_minutes: number;
  total_undertime_count: number;
  total_undertime_minutes: number;
}

export interface BulkDtrEmployee {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  departments: { name: string } | null;
  positions: { title: string } | null;
  plantilla: { position_title: string | null }[] | null;
}

export interface DtrScheduleInfo {
  name: string;
  time_in: string;
  time_out: string;
  break_start: string | null;
  break_end: string | null;
  has_break: boolean;
}

export interface BulkDtrResult {
  employee: BulkDtrEmployee;
  entries: DtrEntry[];
  summary: DtrSummary;
  schedule: DtrScheduleInfo;
  signatory: DtrSignatory;
}

// Department shape (id/name/code) selected alongside DTR employees so the
// signatory can be resolved. Both home and detailed departments use this.
export interface DtrSignatoryDeptRow {
  id: string;
  name: string;
  code: string;
}

// Extra columns selected on employees purely to compute the DTR signatory.
export interface DtrSignatoryFields {
  is_department_head: boolean;
  detailed_department: DtrSignatoryDeptRow | null;
}

/** An employee row shaped by DTR_EMPLOYEE_SELECT — everything the builder needs. */
export type DtrEmployeeRow = BulkDtrEmployee &
  DtrSignatoryFields & {
    department_id: string | null;
    detailed_department_id: string | null;
    user_profile_id: string | null;
    departments: DtrSignatoryDeptRow | null;
    schedules: (ScheduleLike & { name: string }) | null;
  };

/**
 * The one select list that produces a DtrEmployeeRow. Every caller uses it, so
 * adding a field the builder needs is a single edit rather than a hunt through
 * three hand-written select strings that must agree.
 */
export const DTR_EMPLOYEE_SELECT =
  "id, first_name, last_name, middle_name, department_id, detailed_department_id, " +
  "user_profile_id, is_department_head, " +
  "departments!employees_department_id_fkey(id, name, code), " +
  "detailed_department:departments!employees_detailed_department_id_fkey(id, name, code), " +
  "positions(title), plantilla(position_title), " +
  "schedules(id, name, time_in, time_out, break_start, break_end)";

// --- Shared time/rule helpers ---

/** Extract HH:MM from a TIMESTAMPTZ or ISO string */
export function extractTime(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const match = timestamp.match(/(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

/** True if a stored TIMESTAMPTZ's calendar date is after the row's duty date. */
export function timestampOnNextDay(
  timestamp: string | null,
  dutyDate: string,
): boolean {
  if (!timestamp) return false;
  return timestamp.slice(0, 10) > dutyDate;
}

// Spread into DtrEntry pushes for days with no per-slot official-duty reasons.
export const EMPTY_SLOT_REASONS = {
  reason_in_am: null,
  reason_out_am: null,
  reason_in_pm: null,
  reason_out_pm: null,
} as const;

/** Map a stored per-slot reason code to its DTR shortcut (FW / OB / TRAVEL). */
export function slotReasonShort(code: unknown): string | null {
  return code ? NO_TIME_REASON_SHORT[code as NoTimeReason] ?? null : null;
}

// DTR undertime ceiling. A standard workday is 8 hours, so undertime is capped
// at 7 hours: anything from 8 hours up means the employee rendered no
// meaningful service that day and the day is counted ABSENT instead of as a
// near-full-day undertime.
const UNDERTIME_CAP_MINUTES = 7 * 60; // 420
export const UNDERTIME_ABSENT_MINUTES = 8 * 60; // 480

// Applies the cap/absence rule to a day's already-excused late + undertime
// minutes. When undertime reaches 8 hours the day is reclassified absent and
// both late and undertime are zeroed; otherwise undertime is clamped to 7 hours.
export function applyUndertimeAbsenceRule(
  lateMins: number,
  undertimeMins: number,
  alreadyAbsent: boolean,
): { lateMins: number; undertimeMins: number; absent: boolean } {
  if (undertimeMins >= UNDERTIME_ABSENT_MINUTES) {
    return { lateMins: 0, undertimeMins: 0, absent: true };
  }
  return {
    lateMins,
    undertimeMins: Math.min(undertimeMins, UNDERTIME_CAP_MINUTES),
    absent: alreadyAbsent,
  };
}

/**
 * The org-wide default work schedule — the schedules row flagged is_default
 * (migration 036) — applied to employees with no schedule assigned. Falls back
 * to the hardcoded 8:00–17:00 / 12:00–13:00 constant only if no default row
 * exists at all.
 */
export async function resolveDefaultSchedule(
  supabase: AdminClient,
): Promise<ScheduleLike> {
  const { data } = await supabase
    .schema("hris")
    .from("schedules")
    .select("id, time_in, time_out, break_start, break_end")
    .eq("is_default", true)
    .maybeSingle();
  return (data as unknown as ScheduleLike | null) ?? DEFAULT_SCHEDULE;
}

// Fetches every per-day override schedule referenced by a set of attendance logs
// in one query, keyed by schedule id. The DTR builder uses it to recompute
// late / undertime for a day against its pinned schedule instead of the
// employee's assigned one.
export async function loadOverrideSchedules(
  supabase: AdminClient,
  logs: { schedule_id?: string | null }[],
): Promise<Map<string, ScheduleLike>> {
  const ids = [
    ...new Set(
      logs.map((l) => l.schedule_id).filter((id): id is string => !!id),
    ),
  ];
  const map = new Map<string, ScheduleLike>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .schema("hris")
    .from("schedules")
    .select("id, time_in, time_out, break_start, break_end")
    .in("id", ids);
  for (const s of (data ?? []) as unknown as ScheduleLike[]) {
    map.set(s.id, s);
  }
  return map;
}

// --- Employee lookup ---

/**
 * The active plantilla employees a department's DTRs cover, by EFFECTIVE
 * department: employees detailed INTO the department, plus employees whose home
 * is the department and who are not detailed elsewhere. Exclusive, not additive
 * — an employee detailed away is printed under the office that supervises the
 * duty, which is also the office that signs the DTR.
 */
export async function loadDtrEmployeesForDepartment(
  supabase: AdminClient,
  departmentId: string,
): Promise<DtrEmployeeRow[]> {
  const { data } = await supabase
    .schema("hris")
    .from("employees")
    .select(DTR_EMPLOYEE_SELECT)
    .or(
      `detailed_department_id.eq.${departmentId},and(detailed_department_id.is.null,department_id.eq.${departmentId})`,
    )
    .eq("status", "active")
    .eq("employment_type", "plantilla")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  return (data ?? []) as unknown as DtrEmployeeRow[];
}

/**
 * Which of `employeeIds` actually have attendance rows inside the range — the
 * set whose DTR is "available". Callers use it to drop employees whose page
 * would print as a wall of ABSENT rows purely because nothing has been imported
 * for them yet.
 */
export async function employeesWithAttendance(
  supabase: AdminClient,
  employeeIds: string[],
  startDate: string,
  endDate: string,
): Promise<Set<string>> {
  if (employeeIds.length === 0) return new Set();
  const { data } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("employee_id")
    .in("employee_id", employeeIds)
    .gte("date", startDate)
    .lte("date", endDate);
  return new Set((data ?? []).map((r) => r.employee_id as string));
}

// --- The builder ---

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface CalendarDay {
  date: string;
  dayOfWeek: string;
  isWeekend: boolean;
}

function buildCalendar(startDate: string, endDate: string): CalendarDay[] {
  const out: CalendarDay[] = [];
  const d = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  while (d <= end) {
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dow = d.getDay();
    out.push({
      date: dateStr,
      dayOfWeek: DAY_NAMES[dow],
      isWeekend: dow === 0 || dow === 6,
    });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * Build one printable DTR per employee over [startDate, endDate].
 *
 * `signatoryHomeDept`, when given, replaces each employee's own home department
 * while resolving the signatory. Department exports pass the department being
 * exported: every employee in that batch shares it as their EFFECTIVE
 * department, either as home or by detail, and for the detailed ones their
 * detailedDept (the same department) takes precedence anyway. Individual
 * exports pass null and fall back to the employee's own home department.
 *
 * Authorization is the caller's job — see the note at the top of this file.
 */
export async function buildDtrResults(
  supabase: AdminClient,
  employeeRows: DtrEmployeeRow[],
  startDate: string,
  endDate: string,
  signatoryHomeDept: DtrSignatoryDeptRow | null = null,
): Promise<BulkDtrResult[]> {
  if (employeeRows.length === 0) return [];

  const empIds = employeeRows.map((e) => e.id);

  const [{ data: logs }, { data: leaves }] = await Promise.all([
    supabase
      .schema("hris")
      .from("attendance_logs")
      .select(
        "employee_id, date, schedule_id, time_in_am, time_out_am, time_in_pm, time_out_pm, is_late, late_minutes, is_undertime, undertime_minutes, is_absent, remarks, no_time_reason, time_in_am_reason, time_out_am_reason, time_in_pm_reason, time_out_pm_reason",
      )
      .in("employee_id", empIds)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .schema("hris")
      .from("leave_applications")
      .select(
        "employee_id, start_date, end_date, leave_dates, leave_types(code)",
      )
      .in("employee_id", empIds)
      .eq("status", "approved")
      .lte("start_date", endDate)
      .gte("end_date", startDate),
  ]);

  // Index logs and leaves per employee
  const logsByEmp = new Map<string, Map<string, Record<string, unknown>>>();
  for (const log of (logs ?? []) as Record<string, unknown>[]) {
    const empId = log.employee_id as string;
    if (!logsByEmp.has(empId)) logsByEmp.set(empId, new Map());
    logsByEmp.get(empId)!.set(log.date as string, log);
  }

  const leavesByEmp = new Map<string, Map<string, string>>();
  for (const leave of (leaves ?? []) as unknown as {
    employee_id: string;
    start_date: string;
    end_date: string;
    leave_dates: string[] | null;
    leave_types: { code: string } | null;
  }[]) {
    if (!leavesByEmp.has(leave.employee_id))
      leavesByEmp.set(leave.employee_id, new Map());
    const map = leavesByEmp.get(leave.employee_id)!;
    const code = leave.leave_types?.code ?? "Leave";
    const dates = leave.leave_dates;
    if (dates && dates.length > 0) {
      for (const d of dates) map.set(d, code);
    } else {
      const d = new Date(leave.start_date + "T00:00:00");
      const end = new Date(leave.end_date + "T00:00:00");
      while (d <= end) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          map.set(key, code);
        }
        d.setDate(d.getDate() + 1);
      }
    }
  }

  const calendar = buildCalendar(startDate, endDate);
  const defaultSched = await resolveDefaultSchedule(supabase);
  const overrideSchedMap = await loadOverrideSchedules(supabase, logs ?? []);
  const holidayMap = await getHolidayMap(supabase, startDate, endDate);

  // Resolve the DTR signatory for every employee in one batched query.
  const signatoryMap = await resolveSignatories(
    supabase,
    employeeRows.map<SignatoryInput>((emp) => ({
      id: emp.id,
      is_department_head: emp.is_department_head ?? false,
      homeDept: signatoryHomeDept ?? emp.departments,
      detailedDept: emp.detailed_department,
    })),
  );

  return employeeRows.map((emp) => {
    const logMap =
      logsByEmp.get(emp.id) ?? new Map<string, Record<string, unknown>>();
    const leaveMap = leavesByEmp.get(emp.id) ?? new Map<string, string>();
    // Resolve the schedule once so late/undertime per row reflect the schedule
    // the employee is assigned to *now* (not whatever was stamped at import
    // time).
    const sched = emp.schedules ?? defaultSched;

    const entries: DtrEntry[] = [];
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalOnLeave = 0;
    let totalLateCount = 0;
    let totalLateMinutes = 0;
    let totalUndertimeCount = 0;
    let totalUndertimeMinutes = 0;

    for (const day of calendar) {
      const log = logMap.get(day.date);
      const leaveCode = leaveMap.get(day.date) ?? null;
      const holiday = holidayMap.get(day.date) ?? null;
      const holidayType: HolidayType | null = holiday?.type ?? null;
      const holidayName = holiday?.name ?? null;
      const isHalfHoliday =
        holidayType === "half_am" || holidayType === "half_pm";
      const hasPunch =
        !!log &&
        !!(
          log.time_in_am ||
          log.time_out_am ||
          log.time_in_pm ||
          log.time_out_pm
        );

      // Full-day holiday with no punches prints HOLIDAY across the row. If the
      // employee actually worked the holiday, fall through so the times show.
      //
      // An explicit no_time_reason also falls through: somebody stated what
      // that day was (OFF via a clear_as_off correction, LEAVE, TRAVEL...), and
      // a recorded statement about a specific employee's day beats the
      // calendar's default classification. Without this the short-circuit
      // discarded the log entirely — `continue` below — so the reason never
      // reached the DTR and a day cleared as OFF printed HOLIDAY.
      if (holidayType === "full" && !hasPunch && !log?.no_time_reason) {
        entries.push({
          date: day.date,
          day_of_week: day.dayOfWeek,
          time_in_am: null,
          time_out_am: null,
          time_in_pm: null,
          time_out_pm: null,
          is_late: false,
          late_minutes: 0,
          is_undertime: false,
          undertime_minutes: 0,
          is_absent: false,
          remarks: holidayName,
          leave_type: null,
          holiday: "full",
          holiday_name: holidayName,
          no_time_reason_label: null,
          ...EMPTY_SLOT_REASONS,
        });
        continue;
      }

      if (log) {
        const isAbsent = (log.is_absent as boolean) ?? false;
        const noTimeReasonLabel = log.no_time_reason
          ? NO_TIME_REASON_LABELS[log.no_time_reason as NoTimeReason] ?? null
          : null;
        const tInAmRaw = log.time_in_am as string | null;
        const tInPmRaw = log.time_in_pm as string | null;
        const tOutPmRaw = log.time_out_pm as string | null;
        // A day pinned to an override schedule is scored against that schedule;
        // otherwise against the employee's current assigned schedule. Either way
        // late/undertime are recomputed (not read from the stored flags) so the
        // numbers stay correct even after a schedule change.
        const daySched =
          (log.schedule_id
            ? overrideSchedMap.get(log.schedule_id as string)
            : null) ?? sched;
        const lateMins = lateMinutesFor(
          day.date,
          daySched,
          extractTime(tInAmRaw),
          timestampOnNextDay(tInAmRaw, day.date),
        );
        const undertimeMins = undertimeMinutesFor(
          day.date,
          daySched,
          extractTime(tOutPmRaw),
          timestampOnNextDay(tOutPmRaw, day.date),
          !!tInAmRaw,
          extractTime(tInPmRaw),
          timestampOnNextDay(tInPmRaw, day.date),
        );
        const reasonInAm = slotReasonShort(log.time_in_am_reason);
        const reasonOutAm = slotReasonShort(log.time_out_am_reason);
        const reasonInPm = slotReasonShort(log.time_in_pm_reason);
        const reasonOutPm = slotReasonShort(log.time_out_pm_reason);
        // An excused slot — or the holiday portion of a worked holiday — drops
        // the tardiness/undertime tied to it.
        const holidayExcusesLate =
          holidayType === "full" || holidayType === "half_am";
        const holidayExcusesUndertime =
          holidayType === "full" || holidayType === "half_pm";
        const effLateMins = reasonInAm || holidayExcusesLate ? 0 : lateMins;
        const effUndertimeMins =
          reasonOutPm || holidayExcusesUndertime ? 0 : undertimeMins;
        // Cap undertime at 7h; 8h+ reclassifies the day as absent.
        const {
          lateMins: finalLateMins,
          undertimeMins: cappedUndertimeMins,
          absent: dayAbsent,
        } = applyUndertimeAbsenceRule(effLateMins, effUndertimeMins, isAbsent);
        // An absent day is charged a full 8-hour undertime on the DTR.
        const finalUndertimeMins = dayAbsent
          ? UNDERTIME_ABSENT_MINUTES
          : cappedUndertimeMins;
        const isLate = finalLateMins > 0;
        const isUndertime = finalUndertimeMins > 0;
        // A late return from lunch (unexcused, non-holiday) prints the PM
        // arrival red.
        const pmLateMins = pmLateMinutesFor(
          day.date,
          daySched,
          extractTime(tInPmRaw),
          timestampOnNextDay(tInPmRaw, day.date),
        );
        const isPmLate =
          !reasonInPm && !holidayExcusesUndertime && pmLateMins > 0;
        // An absent day (already absent, or reclassified by the 8h rule) prints
        // ABSENT across the row, so any partial punches are not shown.
        const showTimes = !dayAbsent;

        entries.push({
          date: day.date,
          day_of_week: day.dayOfWeek,
          time_in_am: showTimes ? extractTime(tInAmRaw) : null,
          time_out_am: showTimes
            ? extractTime(log.time_out_am as string | null)
            : null,
          time_in_pm: showTimes
            ? extractTime(log.time_in_pm as string | null)
            : null,
          time_out_pm: showTimes ? extractTime(tOutPmRaw) : null,
          is_late: isLate,
          late_minutes: finalLateMins,
          is_pm_late: showTimes && isPmLate,
          is_undertime: isUndertime,
          undertime_minutes: finalUndertimeMins,
          is_absent: dayAbsent,
          remarks: (log.remarks as string | null) ?? null,
          leave_type: leaveCode,
          holiday: holidayType,
          holiday_name: holidayName,
          no_time_reason_label: noTimeReasonLabel,
          reason_in_am: showTimes ? reasonInAm : null,
          reason_out_am: showTimes ? reasonOutAm : null,
          reason_in_pm: showTimes ? reasonInPm : null,
          reason_out_pm: showTimes ? reasonOutPm : null,
        });

        if (!dayAbsent) totalPresent++;
        else totalAbsent++;
        if (isLate) {
          totalLateCount++;
          totalLateMinutes += finalLateMins;
        }
        if (isUndertime) {
          totalUndertimeCount++;
          totalUndertimeMinutes += finalUndertimeMins;
        }
      } else if (!day.isWeekend && leaveCode) {
        entries.push({
          date: day.date,
          day_of_week: day.dayOfWeek,
          time_in_am: null,
          time_out_am: null,
          time_in_pm: null,
          time_out_pm: null,
          is_late: false,
          late_minutes: 0,
          is_undertime: false,
          undertime_minutes: 0,
          is_absent: false,
          remarks: leaveCode,
          leave_type: leaveCode,
          holiday: holidayType,
          holiday_name: holidayName,
          no_time_reason_label: null,
          ...EMPTY_SLOT_REASONS,
        });
        totalOnLeave++;
      } else {
        // A half-day holiday with no punches is not counted as an absence.
        const absent = !day.isWeekend && !isHalfHoliday;
        // An absent day is charged a full 8-hour undertime on the DTR.
        const absentUndertime = absent ? UNDERTIME_ABSENT_MINUTES : 0;
        entries.push({
          date: day.date,
          day_of_week: day.dayOfWeek,
          time_in_am: null,
          time_out_am: null,
          time_in_pm: null,
          time_out_pm: null,
          is_late: false,
          late_minutes: 0,
          is_undertime: absent,
          undertime_minutes: absentUndertime,
          is_absent: absent,
          remarks: day.isWeekend
            ? "Weekend"
            : isHalfHoliday
              ? holidayName
              : null,
          leave_type: null,
          holiday: holidayType,
          holiday_name: holidayName,
          no_time_reason_label: null,
          ...EMPTY_SLOT_REASONS,
        });
        if (absent) {
          totalAbsent++;
          totalUndertimeCount++;
          totalUndertimeMinutes += absentUndertime;
        }
      }
    }

    return {
      employee: {
        id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        middle_name: emp.middle_name,
        departments: emp.departments,
        positions: emp.positions,
        plantilla: emp.plantilla,
      },
      entries,
      summary: {
        total_days_present: totalPresent,
        total_days_absent: totalAbsent,
        total_days_on_leave: totalOnLeave,
        total_late_count: totalLateCount,
        total_late_minutes: totalLateMinutes,
        total_undertime_count: totalUndertimeCount,
        total_undertime_minutes: totalUndertimeMinutes,
      },
      schedule: {
        name: emp.schedules?.name ?? "Default 8:00–17:00",
        time_in: trimTimeStr(sched.time_in)!,
        time_out: trimTimeStr(sched.time_out)!,
        break_start: trimTimeStr(sched.break_start),
        break_end: trimTimeStr(sched.break_end),
        has_break: hasBreak(sched),
      },
      signatory: signatoryMap.get(emp.id) ?? { name: "", title: "" },
    };
  });
}

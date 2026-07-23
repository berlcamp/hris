"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import {
  isDeptScoped,
  isAttendanceManager,
  canManualEntry,
  canPrintDtr,
} from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  DEFAULT_SCHEDULE,
  bucketPunchesForDuty,
  dutyDateFor,
  hasBreak,
  lateMinutesFor,
  pmLateMinutesFor,
  timeOnNextDayForNightShift,
  trimTimeStr,
  undertimeMinutesFor,
  type ScheduleLike,
} from "@/lib/attendance-schedule";
import {
  recomputeAttendanceDeductionFor,
  recomputeAttendanceDeductionsBatch,
} from "@/lib/actions/attendance-deduction-actions";
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
import type { DahuaParsedRow } from "@/lib/dahua-parse";

// --- Types ---

export interface AttendanceLogRow {
  id: string;
  employee_id: string;
  date: string;
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  is_late: boolean;
  late_minutes: number;
  is_undertime: boolean;
  undertime_minutes: number;
  is_absent: boolean;
  remarks: string | null;
  source: string;
  created_at: string;
  created_by_email: string | null;
  updated_by_email: string | null;
  updated_at: string | null;
  // Per-day schedule override (migration 047). NULL means the entry inherits the
  // employee's assigned schedule. `schedules` is the joined override, if any.
  schedule_id: string | null;
  schedules: { name: string } | null;
  employees: {
    first_name: string;
    last_name: string;
    departments: { name: string; code: string } | null;
  } | null;
}

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

export interface ImportPreviewRow extends DahuaParsedRow {
  hasConflict: boolean;
  conflictDetails: string | null;
}

// --- Helpers ---

function addDaysIso(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Convert a date string and HH:MM time string to an ISO timestamp string for TIMESTAMPTZ columns */
function toTimestamp(date: string, time: string | null): string | null {
  if (!time) return null;
  return `${date}T${time}:00`;
}

/** Extract HH:MM from a TIMESTAMPTZ or ISO string */
function extractTime(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const match = timestamp.match(/(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

/** True if a stored TIMESTAMPTZ's calendar date is after the row's duty date. */
function timestampOnNextDay(
  timestamp: string | null,
  dutyDate: string,
): boolean {
  if (!timestamp) return false;
  return timestamp.slice(0, 10) > dutyDate;
}

/**
 * Dahua face devices fire the same event 2–3 times within seconds (e.g. one
 * "Check In" recorded at 07:54:34/37/40). After parse truncates each to HH:MM
 * these become identical punches that overflow the AM/PM slots in
 * bucketPunchesForDuty, pushing the real Break-Out / Check-Out into the wrong
 * column. Collapse a run of punches that share the same minute, or share the
 * same device status and land within 2 minutes of each other (the burst),
 * keeping the earliest — so each real event survives exactly once. Punches far
 * apart in time are never merged, even with the same status.
 */
function dedupePunches(
  punches: { date: string; time: string; status: string }[],
): { date: string; time: string; status: string }[] {
  const normStatus = (s: string) => s.replace(/[\s_-]+/g, "").toLowerCase();
  const toMin = (t: string) => {
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
  };
  const sorted = [...punches].sort((a, b) =>
    `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
  );
  const out: { date: string; time: string; status: string }[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.date === p.date) {
      const sameMinute = p.time === prev.time;
      const sameStatusBurst =
        !!p.status &&
        normStatus(p.status) === normStatus(prev.status) &&
        Math.abs(toMin(p.time) - toMin(prev.time)) <= 2;
      if (sameMinute || sameStatusBurst) continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * The org-wide default work schedule — the schedules row flagged is_default
 * (migration 036) — applied to employees with no schedule assigned. Falls back
 * to the hardcoded 8:00–17:00 / 12:00–13:00 constant only if no default row
 * exists at all.
 */
async function resolveDefaultSchedule(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<ScheduleLike> {
  const { data } = await supabase
    .schema("hris")
    .from("schedules")
    .select("id, time_in, time_out, break_start, break_end")
    .eq("is_default", true)
    .maybeSingle();
  return (data as unknown as ScheduleLike | null) ?? DEFAULT_SCHEDULE;
}

function computeAttendanceFlags(
  entry: {
    time_in_am: string | null;
    time_out_am: string | null;
    time_in_pm: string | null;
    time_out_pm: string | null;
    time_in_am_next_day?: boolean;
    time_in_pm_next_day?: boolean;
    time_out_pm_next_day?: boolean;
  },
  dutyDate: string,
  sched: ScheduleLike,
) {
  const hasAnyLog =
    entry.time_in_am || entry.time_out_am || entry.time_in_pm || entry.time_out_pm;
  // For no-break shifts the single in/out lives in time_in_am / time_out_pm;
  // for has-break shifts the morning in / evening out are the late/undertime
  // anchors. Either way, time_in_am and time_out_pm are correct.
  const lateMinutes = lateMinutesFor(
    dutyDate,
    sched,
    entry.time_in_am,
    entry.time_in_am_next_day ?? false,
  );
  const undertimeMinutes = undertimeMinutesFor(
    dutyDate,
    sched,
    entry.time_out_pm,
    entry.time_out_pm_next_day ?? false,
    !!entry.time_in_am,
    entry.time_in_pm,
    entry.time_in_pm_next_day ?? false,
  );

  return {
    is_late: lateMinutes > 0,
    late_minutes: lateMinutes,
    is_undertime: undertimeMinutes > 0,
    undertime_minutes: undertimeMinutes,
    is_absent: !hasAnyLog,
  };
}

// Spread into DtrEntry pushes for days with no per-slot official-duty reasons.
const EMPTY_SLOT_REASONS = {
  reason_in_am: null,
  reason_out_am: null,
  reason_in_pm: null,
  reason_out_pm: null,
} as const;

/** Map a stored per-slot reason code to its DTR shortcut (FW / OB / TRAVEL). */
function slotReasonShort(code: unknown): string | null {
  return code ? NO_TIME_REASON_SHORT[code as NoTimeReason] ?? null : null;
}

// DTR undertime ceiling. A standard workday is 8 hours, so undertime is capped
// at 7 hours: anything from 8 hours up means the employee rendered no
// meaningful service that day and the day is counted ABSENT instead of as a
// near-full-day undertime.
const UNDERTIME_CAP_MINUTES = 7 * 60; // 420
const UNDERTIME_ABSENT_MINUTES = 8 * 60; // 480

// Applies the cap/absence rule to a day's already-excused late + undertime
// minutes. When undertime reaches 8 hours the day is reclassified absent and
// both late and undertime are zeroed; otherwise undertime is clamped to 7 hours.
function applyUndertimeAbsenceRule(
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

// --- Data Fetching ---

export async function getAttendanceLogs(filters?: {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
}) {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("attendance_logs")
    .select(
      "*, schedules!attendance_logs_schedule_id_fkey(name), employees!attendance_logs_employee_id_fkey(first_name, last_name, departments!employees_department_id_fkey(name, code))"
    )
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.startDate) {
    query = query.gte("date", filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte("date", filters.endDate);
  }
  if (filters?.employeeId) {
    query = query.eq("employee_id", filters.employeeId);
  }

  // Role-based filtering
  if (user.role === "employee") {
    // employees can only see their own attendance
    const { data: empData } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("user_profile_id", user.id)
      .maybeSingle();
    if (empData) {
      query = query.eq("employee_id", empData.id);
    } else {
      return [];
    }
  } else if (isDeptScoped(user.role) && user.departmentId) {
    const { data: deptEmployees } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("department_id", user.departmentId);
    if (deptEmployees && deptEmployees.length > 0) {
      query = query.in("employee_id", deptEmployees.map((e) => e.id));
    } else {
      return [];
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  // Normalize TIMESTAMPTZ columns to HH:MM strings for display
  return (data ?? []).map((row) => ({
    ...row,
    time_in_am: extractTime(row.time_in_am as string | null),
    time_out_am: extractTime(row.time_out_am as string | null),
    time_in_pm: extractTime(row.time_in_pm as string | null),
    time_out_pm: extractTime(row.time_out_pm as string | null),
  })) as AttendanceLogRow[];
}

// --- Manual Attendance Entry ---

// The HH:MM time + per-slot official-duty reason fields shared by single-date
// and date-range manual entry.
interface ManualEntryTimeFields {
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  remarks?: string;
  no_time_reason?: NoTimeReason | null;
  reason_in_am?: NoTimeReason | null;
  reason_out_am?: NoTimeReason | null;
  reason_in_pm?: NoTimeReason | null;
  reason_out_pm?: NoTimeReason | null;
  // Per-day schedule override (migration 047). NULL/undefined => inherit the
  // employee's assigned schedule.
  schedule_id?: string | null;
}

// Builds the attendance_logs row for one duty date from the manual-entry fields,
// applying night-shift next-day handling, late/undertime flags, and official-duty
// reason rules. Shared by createAttendanceEntry and createAttendanceEntryRange.
function buildManualEntryRecord(
  employeeId: string,
  date: string,
  fields: ManualEntryTimeFields,
  sched: ScheduleLike,
) {
  // For night shifts, any HH:MM that precedes the shift's time_in is
  // interpreted as the next calendar day (e.g. a 05:00 clock-out for a
  // 22:00–05:00 shift). Day shifts always stay on the duty date.
  // A night-shift HH:MM rolls to the next calendar day only when it falls in the
  // early-morning portion of the shift (per the off-shift midpoint). This keeps
  // an on-time/early evening clock-in (e.g. 22:00 for a 22:00–05:00 shift) on the
  // duty date instead of mis-dating it a day ahead — which previously read as a
  // full ~1440-min "late". Clock-outs like 06:30 still correctly roll forward.
  const dateFor = (t: string | null): string => {
    if (!t) return date;
    return timeOnNextDayForNightShift(t, sched) ? addDaysIso(date, 1) : date;
  };
  const nextDay = (t: string | null): boolean =>
    !!t && timeOnNextDayForNightShift(t, sched);

  const flags = computeAttendanceFlags(
    {
      ...fields,
      time_in_am_next_day: nextDay(fields.time_in_am),
      time_out_pm_next_day: nextDay(fields.time_out_pm),
    },
    date,
    sched,
  );

  const noTimeReason = fields.no_time_reason ?? null;
  // A reason is kept even when the slot also has a punched time (e.g. a HOLIDAY
  // the employee still logged in on). The DTR prints the reason for that slot
  // instead of the time, and the time stays on record.
  const reasonInAm = fields.reason_in_am ?? null;
  const reasonOutAm = fields.reason_out_am ?? null;
  const reasonInPm = fields.reason_in_pm ?? null;
  const reasonOutPm = fields.reason_out_pm ?? null;
  const hasAnyReason =
    !!noTimeReason ||
    !!reasonInAm ||
    !!reasonOutAm ||
    !!reasonInPm ||
    !!reasonOutPm;

  return {
    employee_id: employeeId,
    date,
    schedule_id: fields.schedule_id ?? null,
    time_in_am: toTimestamp(dateFor(fields.time_in_am), fields.time_in_am),
    time_out_am: toTimestamp(dateFor(fields.time_out_am), fields.time_out_am),
    time_in_pm: toTimestamp(dateFor(fields.time_in_pm), fields.time_in_pm),
    time_out_pm: toTimestamp(dateFor(fields.time_out_pm), fields.time_out_pm),
    remarks: fields.remarks || null,
    no_time_reason: noTimeReason,
    time_in_am_reason: reasonInAm,
    time_out_am_reason: reasonOutAm,
    time_in_pm_reason: reasonInPm,
    time_out_pm_reason: reasonOutPm,
    source: "manual",
    ...flags,
    // An official-duty reason excuses the missing punch: the day is on duty
    // (not absent), and tardiness/undertime tied to the excused slot is dropped.
    ...(reasonInAm ? { is_late: false, late_minutes: 0 } : {}),
    ...(reasonOutPm ? { is_undertime: false, undertime_minutes: 0 } : {}),
    ...(hasAnyReason ? { is_absent: false } : {}),
  };
}

// Resolves the employee's schedule (falling back to the default) so manual entry
// uses the same late / undertime baseline as the importer.
async function resolveEmployeeSchedule(
  supabase: ReturnType<typeof createAdminClient>,
  employeeId: string,
): Promise<ScheduleLike> {
  const { data: emp } = await supabase
    .schema("hris")
    .from("employees")
    .select("schedules(id, time_in, time_out, break_start, break_end)")
    .eq("id", employeeId)
    .maybeSingle();
  return (
    (emp?.schedules as unknown as ScheduleLike | null) ??
    (await resolveDefaultSchedule(supabase))
  );
}

// Loads a specific schedule by id for a per-day override. Returns null if the id
// doesn't resolve (e.g. the schedule was deleted) so the caller can fall back to
// the employee's assigned schedule.
async function resolveScheduleById(
  supabase: ReturnType<typeof createAdminClient>,
  scheduleId: string,
): Promise<ScheduleLike | null> {
  const { data } = await supabase
    .schema("hris")
    .from("schedules")
    .select("id, time_in, time_out, break_start, break_end")
    .eq("id", scheduleId)
    .maybeSingle();
  return (data as unknown as ScheduleLike | null) ?? null;
}

// Fetches every per-day override schedule referenced by a set of attendance logs
// in one query, keyed by schedule id. The DTR builders use it to recompute
// late / undertime for a day against its pinned schedule instead of the
// employee's assigned one.
async function loadOverrideSchedules(
  supabase: ReturnType<typeof createAdminClient>,
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

// Audit columns for an attendance_logs upsert. On a fresh row the signed-in user
// is the creator and the updated_* fields stay null; on an edit the original
// creator is preserved and the editor is stamped.
function auditFields(
  existing: { created_by: string | null; created_by_email: string | null } | null | undefined,
  user: { id: string; email: string },
  now: string,
) {
  if (!existing) {
    return {
      created_by: user.id,
      created_by_email: user.email,
      updated_by: null as string | null,
      updated_by_email: null as string | null,
      updated_at: null as string | null,
    };
  }
  return {
    created_by: existing.created_by,
    created_by_email: existing.created_by_email,
    updated_by: user.id,
    updated_by_email: user.email,
    updated_at: now,
  };
}

export async function createAttendanceEntry(input: {
  employee_id: string;
  date: string;
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  remarks?: string;
  no_time_reason?: NoTimeReason | null;
  reason_in_am?: NoTimeReason | null;
  reason_out_am?: NoTimeReason | null;
  reason_in_pm?: NoTimeReason | null;
  reason_out_pm?: NoTimeReason | null;
  schedule_id?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user || !canManualEntry(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();
  // A per-day override schedule (if picked and still valid) takes precedence over
  // the employee's assigned schedule for late/undertime and night-shift handling.
  const overrideSched = input.schedule_id
    ? await resolveScheduleById(supabase, input.schedule_id)
    : null;
  const sched =
    overrideSched ?? (await resolveEmployeeSchedule(supabase, input.employee_id));
  const scheduleId = overrideSched ? input.schedule_id! : null;

  // Preserve the original creator across edits.
  const { data: existing } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("created_by, created_by_email")
    .eq("employee_id", input.employee_id)
    .eq("date", input.date)
    .maybeSingle();

  const record = {
    ...buildManualEntryRecord(
      input.employee_id,
      input.date,
      { ...input, schedule_id: scheduleId },
      sched,
    ),
    ...auditFields(
      existing as { created_by: string | null; created_by_email: string | null } | null,
      { id: user.id, email: user.email },
      new Date().toISOString(),
    ),
  };

  // (employee_id, date) is unique; upsert so re-entering a date overwrites.
  const { error } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .upsert(record, { onConflict: "employee_id,date" });
  if (error) throw error;

  // Keep the VL ledger in sync with the (possibly mid-month) edit.
  const [y, m] = input.date.split("-").map(Number);
  await recomputeAttendanceDeductionFor(input.employee_id, y, m);

  revalidatePath("/attendance");
  return { success: true };
}

// Saves several manual entries for one employee in a single call — each with its
// own date and times — so a stretch of days can be filled from a per-date grid.
export async function createAttendanceEntriesBulk(input: {
  employee_id: string;
  entries: Array<
    ManualEntryTimeFields & {
      date: string;
    }
  >;
}) {
  const user = await getCurrentUser();
  if (!user || !canManualEntry(user.role)) {
    throw new Error("Unauthorized");
  }

  if (!input.entries || input.entries.length === 0) {
    return { success: true, count: 0 };
  }
  // Guard against an unbounded payload.
  if (input.entries.length > 366) {
    throw new Error("Too many dates in one save (max 366).");
  }

  const supabase = createAdminClient();
  const employeeSched = await resolveEmployeeSchedule(supabase, input.employee_id);

  // Resolve any per-day override schedules referenced across the batch in one
  // query. Entries with no (or an invalid) override fall back to the employee's
  // assigned schedule, exactly like single-entry create.
  const overrideIds = [
    ...new Set(
      input.entries
        .map((e) => e.schedule_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const overrideSchedById = new Map<string, ScheduleLike>();
  if (overrideIds.length > 0) {
    const { data: schedRows } = await supabase
      .schema("hris")
      .from("schedules")
      .select("id, time_in, time_out, break_start, break_end")
      .in("id", overrideIds);
    for (const s of (schedRows ?? []) as unknown as ScheduleLike[]) {
      overrideSchedById.set(s.id, s);
    }
  }

  // Preserve the original creator of any dates that already exist.
  const { data: existingRows } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("date, created_by, created_by_email")
    .eq("employee_id", input.employee_id)
    .in("date", input.entries.map((e) => e.date));
  const existingByDate = new Map(
    ((existingRows ?? []) as Array<{
      date: string;
      created_by: string | null;
      created_by_email: string | null;
    }>).map((r) => [r.date, r]),
  );
  const now = new Date().toISOString();
  const actor = { id: user.id, email: user.email };

  const records = input.entries.map((e) => {
    const override = e.schedule_id
      ? overrideSchedById.get(e.schedule_id) ?? null
      : null;
    const sched = override ?? employeeSched;
    const scheduleId = override ? e.schedule_id! : null;
    return {
      ...buildManualEntryRecord(
        input.employee_id,
        e.date,
        { ...e, schedule_id: scheduleId },
        sched,
      ),
      ...auditFields(existingByDate.get(e.date), actor, now),
    };
  });

  const { error } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .upsert(records, { onConflict: "employee_id,date" });
  if (error) throw error;

  // Recompute the VL ledger once per affected month.
  const months = new Set(input.entries.map((e) => e.date.slice(0, 7)));
  for (const ym of months) {
    const [y, m] = ym.split("-").map(Number);
    await recomputeAttendanceDeductionFor(input.employee_id, y, m);
  }

  revalidatePath("/attendance");
  return { success: true, count: records.length };
}

// --- Delete a single attendance entry ---

export async function deleteAttendanceEntry(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.role)) {
    return { error: "Unauthorized" };
  }

  const supabase = createAdminClient();

  // Read the row first so we can refresh the right employee/month afterwards.
  const { data: existing } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("id, employee_id, date")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return { error: "Entry not found" };

  const { error } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  // Keep the VL ledger in sync with the removed day.
  const [y, m] = (existing.date as string).split("-").map(Number);
  await recomputeAttendanceDeductionFor(existing.employee_id as string, y, m);

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "delete",
    tableName: "attendance_logs",
    recordId: id,
    oldValues: { employee_id: existing.employee_id, date: existing.date },
  });

  revalidatePath("/attendance");
  return { success: true };
}

// --- Fetch a single attendance entry for correction (pre-fills the form) ---

export async function getAttendanceEntryForEdit(id: string) {
  const user = await getCurrentUser();
  if (!user || !canManualEntry(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select(
      "id, employee_id, date, schedule_id, time_in_am, time_out_am, time_in_pm, time_out_pm, remarks, no_time_reason, time_in_am_reason, time_out_am_reason, time_in_pm_reason, time_out_pm_reason",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id as string,
    employee_id: data.employee_id as string,
    date: data.date as string,
    schedule_id: (data.schedule_id as string | null) ?? null,
    time_in_am: extractTime(data.time_in_am as string | null) ?? "",
    time_out_am: extractTime(data.time_out_am as string | null) ?? "",
    time_in_pm: extractTime(data.time_in_pm as string | null) ?? "",
    time_out_pm: extractTime(data.time_out_pm as string | null) ?? "",
    remarks: (data.remarks as string | null) ?? "",
    no_time_reason: (data.no_time_reason as NoTimeReason | null) ?? null,
    reason_in_am: (data.time_in_am_reason as NoTimeReason | null) ?? null,
    reason_out_am: (data.time_out_am_reason as NoTimeReason | null) ?? null,
    reason_in_pm: (data.time_in_pm_reason as NoTimeReason | null) ?? null,
    reason_out_pm: (data.time_out_pm_reason as NoTimeReason | null) ?? null,
  };
}

// --- Match parsed rows to employees and check conflicts ---
// Dahua exports are parsed in the browser (see src/lib/dahua-parse.ts) so the
// multi-MB raw file never crosses the Server Action 1MB body limit; only the
// compact parsed rows reach the actions below.

export async function matchAndPreviewImport(
  parsedRows: DahuaParsedRow[]
): Promise<ImportPreviewRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  // Get all employee IDs (and their schedule) mapped by biometric_no
  const uniqueNos = [...new Set(parsedRows.map((r) => r.employeeNo))];
  const numericNos = uniqueNos.map(Number).filter((n) => !isNaN(n));
  const { data: employees } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, biometric_no, schedules(id, time_in, time_out, break_start, break_end)",
    )
    .in("biometric_no", numericNos);

  const empRows = (employees ?? []) as unknown as {
    id: string;
    biometric_no: number;
    schedules: ScheduleLike | null;
  }[];

  const empMap = new Map(empRows.map((e) => [String(e.biometric_no), e.id]));
  const defaultSched = await resolveDefaultSchedule(supabase);
  const schedByEmp = new Map<string, ScheduleLike>(
    empRows.map((e) => [e.id, e.schedules ?? defaultSched]),
  );

  // Compute duty dates per parsed row using each employee's schedule so the
  // preview reports conflicts against the bucket the importer will actually
  // write to (matters for night shifts).
  const previewWithDuty = parsedRows.map((row) => {
    const employeeId = empMap.get(row.employeeNo) ?? null;
    const sched = employeeId
      ? schedByEmp.get(employeeId) ?? defaultSched
      : defaultSched;
    const duty = employeeId ? dutyDateFor(row.date, row.time, sched) : row.date;
    return { row, employeeId, duty };
  });

  const dutyDates = [
    ...new Set(previewWithDuty.map((p) => p.duty)),
  ];
  const employeeIds = [...new Set(empRows.map((e) => e.id))];

  let existingLogs: { employee_id: string; date: string }[] = [];
  if (employeeIds.length > 0 && dutyDates.length > 0) {
    const { data } = await supabase
      .schema("hris")
      .from("attendance_logs")
      .select("employee_id, date")
      .in("employee_id", employeeIds)
      .in("date", dutyDates);
    existingLogs = data ?? [];
  }

  const existingSet = new Set(
    existingLogs.map((l) => `${l.employee_id}_${l.date}`),
  );

  return previewWithDuty.map(({ row, employeeId, duty }) => {
    const matched = employeeId !== null;
    const hasConflict =
      matched && existingSet.has(`${employeeId}_${duty}`);

    return {
      ...row,
      matched,
      employeeId,
      hasConflict,
      conflictDetails: hasConflict
        ? "Existing record will be updated"
        : !matched
        ? "Employee not found in system"
        : null,
    };
  });
}

// --- Import Dahua attendance data ---

// Compact raw punch persisted per import batch so an import can be re-bucketed
// later ("replay") without the original Dahua file. Mirrors the parsed rows the
// browser sends to the importer.
interface StoredPunch {
  employeeNo: string;
  employeeName: string;
  date: string;
  time: string;
  status: string;
}

// Shared core for the Dahua importer AND import replay: groups matched punches
// by employee + duty date, honors any per-day override schedule already pinned
// to that day, buckets each group into AM/PM slots, and builds the
// attendance_logs upsert row. Keeping this in ONE place is what lets replay
// re-apply a bucketing fix identically to a fresh import. Returns each record's
// `${employeeId}_${dutyDate}` key (parallel to `records`) and the source of any
// existing row per key, so callers can decide what to overwrite vs. skip.
async function buildBiometricRecords(
  supabase: ReturnType<typeof createAdminClient>,
  matchedPunches: {
    employeeId: string;
    date: string;
    time: string;
    status: string;
  }[],
  schedByEmp: Map<string, ScheduleLike>,
  defaultSched: ScheduleLike,
): Promise<{
  records: Record<string, unknown>[];
  keys: string[];
  existingSourceByKey: Map<string, string>;
  touched: { employeeId: string; year: number; month: number }[];
  errors: number;
}> {
  interface Group {
    employeeId: string;
    dutyDate: string;
    sched: ScheduleLike;
    punches: { date: string; time: string; status: string }[];
  }
  const grouped = new Map<string, Group>();
  for (const p of matchedPunches) {
    const sched = schedByEmp.get(p.employeeId) ?? defaultSched;
    const dutyDate = dutyDateFor(p.date, p.time, sched);
    const key = `${p.employeeId}_${dutyDate}`;
    if (!grouped.has(key)) {
      grouped.set(key, { employeeId: p.employeeId, dutyDate, sched, punches: [] });
    }
    grouped.get(key)!.punches.push({ date: p.date, time: p.time, status: p.status });
  }

  // Honor per-day schedule overrides pinned by a DTR manager, and capture each
  // existing row's source so replay can skip days a human has since corrected.
  const overrideSchedByKey = new Map<string, ScheduleLike>();
  const existingSourceByKey = new Map<string, string>();
  const employeeIds = [...new Set([...grouped.values()].map((g) => g.employeeId))];
  const dutyDates = [...new Set([...grouped.values()].map((g) => g.dutyDate))];
  if (employeeIds.length > 0 && dutyDates.length > 0) {
    const { data: existing } = await supabase
      .schema("hris")
      .from("attendance_logs")
      .select("employee_id, date, schedule_id, source")
      .in("employee_id", employeeIds)
      .in("date", dutyDates);
    const existingRows = (existing ?? []) as {
      employee_id: string;
      date: string;
      schedule_id: string | null;
      source: string | null;
    }[];
    const schedById = await loadOverrideSchedules(supabase, existingRows);
    for (const r of existingRows) {
      const key = `${r.employee_id}_${r.date}`;
      existingSourceByKey.set(key, r.source ?? "");
      if (r.schedule_id) {
        const sched = schedById.get(r.schedule_id);
        if (sched) overrideSchedByKey.set(key, sched);
      }
    }
  }

  const records: Record<string, unknown>[] = [];
  const keys: string[] = [];
  const touched: { employeeId: string; year: number; month: number }[] = [];
  let errors = 0;
  for (const [key, group] of grouped) {
    try {
      // A pinned override schedule for this day wins over the employee's
      // assigned one (for break-window bucketing and late/undertime).
      const overrideSched = overrideSchedByKey.get(key) ?? null;
      const effSched = overrideSched ?? group.sched;

      const bucket = bucketPunchesForDuty(
        dedupePunches(group.punches),
        group.dutyDate,
        effSched,
      );

      const flags = computeAttendanceFlags(
        {
          time_in_am: bucket.time_in_am,
          time_out_am: bucket.time_out_am,
          time_in_pm: bucket.time_in_pm,
          time_out_pm: bucket.time_out_pm,
          time_in_am_next_day: bucket.time_in_am_next_day,
          time_out_pm_next_day: bucket.time_out_pm_next_day,
        },
        group.dutyDate,
        effSched,
      );

      const nextDate = addDaysIso(group.dutyDate, 1);
      const dateOf = (onNext: boolean) => (onNext ? nextDate : group.dutyDate);

      records.push({
        employee_id: group.employeeId,
        date: group.dutyDate,
        schedule_id: overrideSched?.id ?? null,
        time_in_am: toTimestamp(dateOf(bucket.time_in_am_next_day), bucket.time_in_am),
        time_out_am: toTimestamp(dateOf(bucket.time_out_am_next_day), bucket.time_out_am),
        time_in_pm: toTimestamp(dateOf(bucket.time_in_pm_next_day), bucket.time_in_pm),
        time_out_pm: toTimestamp(dateOf(bucket.time_out_pm_next_day), bucket.time_out_pm),
        ...flags,
        source: "biometric",
        remarks: null,
      });
      keys.push(key);

      const [yr, mo] = group.dutyDate.split("-").map(Number);
      touched.push({ employeeId: group.employeeId, year: yr, month: mo });
    } catch {
      errors++;
    }
  }
  return { records, keys, existingSourceByKey, touched, errors };
}

// Persist the raw parsed punches for this import so it can be replayed later.
// Stores ALL rows (even unmatched) so a replay can re-match employees added
// after the fact. Best-effort: a failed save must not fail the import itself.
async function saveImportBatch(
  supabase: ReturnType<typeof createAdminClient>,
  importedBy: string,
  previewRows: ImportPreviewRow[],
): Promise<void> {
  if (previewRows.length === 0) return;
  const punches: StoredPunch[] = previewRows.map((r) => ({
    employeeNo: r.employeeNo,
    employeeName: r.employeeName,
    date: r.date,
    time: r.time,
    status: r.status,
  }));
  const dates = punches.map((p) => p.date).filter(Boolean).sort();
  try {
    await supabase
      .schema("hris")
      .from("attendance_import_batches")
      .insert({
        imported_by: importedBy,
        period_start: dates[0] ?? null,
        period_end: dates[dates.length - 1] ?? null,
        punch_count: punches.length,
        punches,
      });
  } catch {
    // swallow — the attendance rows are already written; replay is a convenience
  }
}

export async function importDahuaAttendance(
  previewRows: ImportPreviewRow[],
  overwriteExisting: boolean
): Promise<{
  imported: number;
  skipped: number;
  errors: number;
  totalPunches: number;
  unmatchedPunches: number;
  dayRecords: number;
}> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  // Fetch each matched employee's schedule once so bucketing matches the
  // preview's duty-date calculation.
  const employeeIds = [
    ...new Set(
      previewRows
        .filter((r) => r.matched && r.employeeId)
        .map((r) => r.employeeId as string),
    ),
  ];

  const defaultSched = await resolveDefaultSchedule(supabase);
  const schedByEmp = new Map<string, ScheduleLike>();
  if (employeeIds.length > 0) {
    const { data: emps } = await supabase
      .schema("hris")
      .from("employees")
      .select("id, schedules(id, time_in, time_out, break_start, break_end)")
      .in("id", employeeIds);
    for (const e of (emps ?? []) as unknown as {
      id: string;
      schedules: ScheduleLike | null;
    }[]) {
      schedByEmp.set(e.id, e.schedules ?? defaultSched);
    }
  }

  // Pre-filter conflicts (skipped when not overwriting) and collect the matched
  // punches; the shared builder handles grouping, override schedules, bucketing
  // and flag computation — identical to replay.
  const skipKeys = new Set<string>();
  const matched: {
    employeeId: string;
    date: string;
    time: string;
    status: string;
  }[] = [];
  for (const row of previewRows) {
    if (!row.matched || !row.employeeId) continue;
    const sched = schedByEmp.get(row.employeeId) ?? defaultSched;
    const dutyDate = dutyDateFor(row.date, row.time, sched);
    if (row.hasConflict && !overwriteExisting) {
      skipKeys.add(`${row.employeeId}_${dutyDate}`);
      continue;
    }
    matched.push({
      employeeId: row.employeeId,
      date: row.date,
      time: row.time,
      status: row.status,
    });
  }

  const { records, touched, errors: buildErrors } = await buildBiometricRecords(
    supabase,
    matched,
    schedByEmp,
    defaultSched,
  );

  let imported = 0;
  let errors = buildErrors;
  const skipped = skipKeys.size;

  // Batch-upsert against the UNIQUE(employee_id, date) constraint instead of a
  // SELECT + INSERT/UPDATE per group. The old per-row loop did ~2 sequential DB
  // round-trips per record, which blew past the serverless function timeout on
  // large imports (3000+ punches). When overwrite is off, `ignoreDuplicates`
  // makes existing rows a no-op (conflicts are already filtered into skipKeys);
  // when on, it merges over the existing row. `.select("id")` returns only the
  // rows actually written, giving an accurate `imported` count either way.
  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    try {
      const { data, error } = await supabase
        .schema("hris")
        .from("attendance_logs")
        .upsert(chunk, {
          onConflict: "employee_id,date",
          ignoreDuplicates: !overwriteExisting,
        })
        .select("id");
      if (error) throw error;
      imported += data?.length ?? 0;
    } catch {
      errors += chunk.length;
    }
  }

  // Refresh VL ledger for every (employee, month) the import touched.
  if (touched.length > 0) {
    await recomputeAttendanceDeductionsBatch(touched);
  }

  // Save the raw punches so this import can be replayed after a bucketing fix.
  await saveImportBatch(supabase, user.id, previewRows);

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "import_attendance",
    tableName: "attendance_logs",
    newValues: { imported, skipped, errors, overwriteExisting, totalRows: previewRows.length },
  });

  revalidatePath("/attendance");
  const matchedPunches = previewRows.filter((r) => r.matched).length;
  return {
    imported,
    skipped,
    errors,
    totalPunches: previewRows.length,
    unmatchedPunches: previewRows.length - matchedPunches,
    dayRecords: records.length,
  };
}

// --- Import batches: list + replay ---

export interface ImportBatchRow {
  id: string;
  imported_at: string;
  period_start: string | null;
  period_end: string | null;
  punch_count: number;
  imported_by_name: string | null;
}

// Lists saved import batches, newest first, for the "Past Imports" list.
export async function getImportBatches(): Promise<ImportBatchRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.role)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("attendance_import_batches")
    .select(
      "id, imported_at, period_start, period_end, punch_count, user_profiles(full_name, email)",
    )
    .order("imported_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const prof = r.user_profiles as unknown as {
      full_name: string | null;
      email: string | null;
    } | null;
    return {
      id: r.id as string,
      imported_at: r.imported_at as string,
      period_start: r.period_start as string | null,
      period_end: r.period_end as string | null,
      punch_count: r.punch_count as number,
      imported_by_name: prof?.full_name ?? prof?.email ?? null,
    };
  });
}

// Loads a batch's raw punches and re-matches them to employees by biometric_no,
// resolving each matched employee's schedule. Shared by preview + run. Returns
// the matched punch list, schedule map, default schedule, and the count of
// punches whose biometric_no isn't in the system.
async function loadBatchForReplay(
  supabase: ReturnType<typeof createAdminClient>,
  batchId: string,
): Promise<{
  matched: { employeeId: string; date: string; time: string; status: string }[];
  schedByEmp: Map<string, ScheduleLike>;
  defaultSched: ScheduleLike;
  unmatchedPunches: number;
}> {
  const { data: batch, error } = await supabase
    .schema("hris")
    .from("attendance_import_batches")
    .select("punches")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw error;
  if (!batch) throw new Error("Import not found");

  const punches = (batch.punches ?? []) as StoredPunch[];
  const uniqueNos = [...new Set(punches.map((p) => p.employeeNo))];
  const numericNos = uniqueNos.map(Number).filter((n) => !isNaN(n));
  const { data: employees } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, biometric_no, schedules(id, time_in, time_out, break_start, break_end)",
    )
    .in("biometric_no", numericNos);
  const empRows = (employees ?? []) as unknown as {
    id: string;
    biometric_no: number;
    schedules: ScheduleLike | null;
  }[];
  const empMap = new Map(empRows.map((e) => [String(e.biometric_no), e.id]));
  const defaultSched = await resolveDefaultSchedule(supabase);
  const schedByEmp = new Map<string, ScheduleLike>(
    empRows.map((e) => [e.id, e.schedules ?? defaultSched]),
  );

  const matched: {
    employeeId: string;
    date: string;
    time: string;
    status: string;
  }[] = [];
  let unmatchedPunches = 0;
  for (const p of punches) {
    const employeeId = empMap.get(p.employeeNo);
    if (!employeeId) {
      unmatchedPunches++;
      continue;
    }
    matched.push({ employeeId, date: p.date, time: p.time, status: p.status });
  }
  return { matched, schedByEmp, defaultSched, unmatchedPunches };
}

export interface ReplayPreview {
  daysToRebucket: number;
  daysToSkip: number;
  unmatchedPunches: number;
}

// Dry run: how many days a replay would re-bucket vs. skip (because the day is
// no longer a plain biometric row — a manager corrected it since). No writes.
export async function previewImportReplay(
  batchId: string,
): Promise<ReplayPreview> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.role)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { matched, schedByEmp, defaultSched, unmatchedPunches } =
    await loadBatchForReplay(supabase, batchId);
  const { keys, existingSourceByKey } = await buildBiometricRecords(
    supabase,
    matched,
    schedByEmp,
    defaultSched,
  );
  let daysToSkip = 0;
  for (const key of keys) {
    const src = existingSourceByKey.get(key);
    if (src !== undefined && src !== "biometric") daysToSkip++;
  }
  return {
    daysToRebucket: keys.length - daysToSkip,
    daysToSkip,
    unmatchedPunches,
  };
}

// Re-buckets a saved import with the current logic. Overwrites only days whose
// attendance_logs row is still source = 'biometric' (or absent); any day a
// manager manually edited since is left untouched.
export async function runImportReplay(batchId: string): Promise<{
  reBucketed: number;
  skipped: number;
  unmatchedPunches: number;
  errors: number;
}> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.role)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { matched, schedByEmp, defaultSched, unmatchedPunches } =
    await loadBatchForReplay(supabase, batchId);
  const { records, keys, existingSourceByKey, touched, errors: buildErrors } =
    await buildBiometricRecords(supabase, matched, schedByEmp, defaultSched);

  // Keep only records whose day is safe to overwrite: no existing row, or an
  // existing row still sourced from biometric. Skip anything a human touched.
  const toWrite: Record<string, unknown>[] = [];
  const toWriteTouched: typeof touched = [];
  let skipped = 0;
  for (let i = 0; i < records.length; i++) {
    const src = existingSourceByKey.get(keys[i]);
    if (src !== undefined && src !== "biometric") {
      skipped++;
      continue;
    }
    toWrite.push(records[i]);
    toWriteTouched.push(touched[i]);
  }

  let errors = buildErrors;
  let reBucketed = 0;
  const CHUNK = 500;
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    const chunk = toWrite.slice(i, i + CHUNK);
    try {
      const { data, error } = await supabase
        .schema("hris")
        .from("attendance_logs")
        .upsert(chunk, { onConflict: "employee_id,date", ignoreDuplicates: false })
        .select("id");
      if (error) throw error;
      reBucketed += data?.length ?? 0;
    } catch {
      errors += chunk.length;
    }
  }

  if (toWriteTouched.length > 0) {
    await recomputeAttendanceDeductionsBatch(toWriteTouched);
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "replay_attendance_import",
    tableName: "attendance_logs",
    recordId: batchId,
    newValues: { reBucketed, skipped, unmatchedPunches, errors },
  });

  revalidatePath("/attendance");
  return { reBucketed, skipped, unmatchedPunches, errors };
}

// --- Bulk DTR (department + date range) ---

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
interface DtrSignatoryDeptRow {
  id: string;
  name: string;
  code: string;
}

// Extra columns selected on employees purely to compute the DTR signatory.
interface DtrSignatoryFields {
  is_department_head: boolean;
  detailed_department: DtrSignatoryDeptRow | null;
}

export async function getDepartmentDtrBulk(
  departmentId: string,
  startDate: string,
  endDate: string,
): Promise<{ department: { id: string; name: string } | null; results: BulkDtrResult[] }> {
  const user = await getCurrentUser();
  // Bulk export covers a whole department, so it is limited to the roles that
  // print DTRs across departments (mirrors the /attendance/dtr/bulk gate).
  if (!user || !canPrintDtr(user.role)) throw new Error("Unauthorized");

  if (!startDate || !endDate) {
    throw new Error("Date range required");
  }
  if (startDate > endDate) {
    throw new Error("Start date must be on or before end date");
  }

  const supabase = createAdminClient();

  const { data: department } = await supabase
    .schema("hris")
    .from("departments")
    .select("id, name, code")
    .eq("id", departmentId)
    .maybeSingle();

  // Filter by EFFECTIVE department: an employee detailed to another office is
  // exported under that detailed office, not their home one. So include
  // employees detailed to this department, plus employees whose home is this
  // department and who are not detailed elsewhere.
  const { data: employees } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, first_name, last_name, middle_name, is_department_head, departments!employees_department_id_fkey(name), detailed_department:departments!employees_detailed_department_id_fkey(id, name, code), positions(title), plantilla(position_title), schedules(id, name, time_in, time_out, break_start, break_end)",
    )
    .or(
      `detailed_department_id.eq.${departmentId},and(detailed_department_id.is.null,department_id.eq.${departmentId})`,
    )
    .eq("status", "active")
    .eq("employment_type", "plantilla")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const employeeRowsAll = (employees ?? []) as unknown as (BulkDtrEmployee &
    DtrSignatoryFields & {
      schedules: (ScheduleLike & { name: string }) | null;
    })[];
  if (employeeRowsAll.length === 0) {
    return { department: department ?? null, results: [] };
  }

  // Restrict to employees who actually have attendance_logs in the range —
  // "inclusion" is implicit by the presence of records.
  const { data: withLogs } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("employee_id")
    .in("employee_id", employeeRowsAll.map((e) => e.id))
    .gte("date", startDate)
    .lte("date", endDate);
  const withLogsSet = new Set(
    (withLogs ?? []).map((r) => r.employee_id as string),
  );
  const employeeRows = employeeRowsAll.filter((e) => withLogsSet.has(e.id));
  if (employeeRows.length === 0) {
    return { department: department ?? null, results: [] };
  }

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
      .select("employee_id, start_date, end_date, leave_dates, leave_types(code)")
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
    if (!leavesByEmp.has(leave.employee_id)) leavesByEmp.set(leave.employee_id, new Map());
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

  // Build the calendar between startDate and endDate inclusive
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const calendar: { date: string; dayOfWeek: string; isWeekend: boolean }[] = [];
  {
    const d = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    while (d <= end) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dow = d.getDay();
      calendar.push({
        date: dateStr,
        dayOfWeek: dayNames[dow],
        isWeekend: dow === 0 || dow === 6,
      });
      d.setDate(d.getDate() + 1);
    }
  }

  const defaultSched = await resolveDefaultSchedule(supabase);
  const overrideSchedMap = await loadOverrideSchedules(supabase, logs ?? []);
  const holidayMap = await getHolidayMap(supabase, startDate, endDate);

  // Resolve the DTR signatory for every employee in one batched query. Every
  // employee here shares the same EFFECTIVE department (the one being exported):
  // either it is their home department, or they are detailed into it. Passing
  // the exported department as homeDept is therefore safe — for the detailed
  // employees their detailedDept (the same department) takes precedence anyway.
  const effectiveDept = (department as DtrSignatoryDeptRow | null) ?? null;
  const signatoryMap = await resolveSignatories(
    supabase,
    employeeRows.map<SignatoryInput>((emp) => ({
      id: emp.id,
      is_department_head: emp.is_department_head ?? false,
      homeDept: effectiveDept,
      detailedDept: emp.detailed_department,
    })),
  );

  const results: BulkDtrResult[] = employeeRows.map((emp) => {
    const logMap = logsByEmp.get(emp.id) ?? new Map<string, Record<string, unknown>>();
    const leaveMap = leavesByEmp.get(emp.id) ?? new Map<string, string>();
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
        !!(log.time_in_am || log.time_out_am || log.time_in_pm || log.time_out_pm);

      // Full-day holiday with no punches prints HOLIDAY across the row. If the
      // employee actually worked the holiday, fall through so the times show.
      if (holidayType === "full" && !hasPunch) {
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
          time_out_am: showTimes ? extractTime(log.time_out_am as string | null) : null,
          time_in_pm: showTimes ? extractTime(log.time_in_pm as string | null) : null,
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
          remarks: day.isWeekend ? "Weekend" : isHalfHoliday ? holidayName : null,
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

  return { department: department ?? null, results };
}

// --- Individual DTR over an arbitrary date range ---

export async function getEmployeeDtrRange(
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<BulkDtrResult | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  if (!startDate || !endDate) {
    throw new Error("Date range required");
  }
  if (startDate > endDate) {
    throw new Error("Start date must be on or before end date");
  }

  const supabase = createAdminClient();

  const { data: employee } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, first_name, last_name, middle_name, department_id, user_profile_id, is_department_head, departments!employees_department_id_fkey(id, name, code), detailed_department:departments!employees_detailed_department_id_fkey(id, name, code), positions(title), plantilla(position_title), schedules(id, name, time_in, time_out, break_start, break_end)",
    )
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) return null;

  // Employees may only fetch their own DTR.
  if (user.role === "employee" && (employee as { user_profile_id: string | null }).user_profile_id !== user.id) {
    throw new Error("Unauthorized");
  }

  // Dept-scoped users (non-composite) may only fetch DTRs for employees in
  // their own department.
  if (
    isDeptScoped(user.role) &&
    user.role !== "department_admin_and_department_head" &&
    user.departmentId &&
    (employee as { department_id: string | null }).department_id !== user.departmentId
  ) {
    throw new Error("Unauthorized");
  }

  const [{ data: logs }, { data: leaves }] = await Promise.all([
    supabase
      .schema("hris")
      .from("attendance_logs")
      .select(
        "date, schedule_id, time_in_am, time_out_am, time_in_pm, time_out_pm, is_late, late_minutes, is_undertime, undertime_minutes, is_absent, remarks, no_time_reason, time_in_am_reason, time_out_am_reason, time_in_pm_reason, time_out_pm_reason",
      )
      .eq("employee_id", employeeId)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .schema("hris")
      .from("leave_applications")
      .select("start_date, end_date, leave_dates, leave_types(code)")
      .eq("employee_id", employeeId)
      .eq("status", "approved")
      .lte("start_date", endDate)
      .gte("end_date", startDate),
  ]);

  const logMap = new Map<string, Record<string, unknown>>();
  for (const log of (logs ?? []) as Record<string, unknown>[]) {
    logMap.set(log.date as string, log);
  }

  const leaveMap = new Map<string, string>();
  for (const leave of (leaves ?? []) as unknown as {
    start_date: string;
    end_date: string;
    leave_dates: string[] | null;
    leave_types: { code: string } | null;
  }[]) {
    const code = leave.leave_types?.code ?? "Leave";
    const dates = leave.leave_dates;
    if (dates && dates.length > 0) {
      for (const d of dates) leaveMap.set(d, code);
    } else {
      const d = new Date(leave.start_date + "T00:00:00");
      const end = new Date(leave.end_date + "T00:00:00");
      while (d <= end) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          leaveMap.set(key, code);
        }
        d.setDate(d.getDate() + 1);
      }
    }
  }

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const entries: DtrEntry[] = [];
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalOnLeave = 0;
  let totalLateCount = 0;
  let totalLateMinutes = 0;
  let totalUndertimeCount = 0;
  let totalUndertimeMinutes = 0;

  // Resolve current schedule once so late/undertime per row reflect the
  // schedule the employee is assigned to *now* (not whatever was stamped at
  // import time).
  const empSchedule =
    ((employee as unknown) as { schedules: ScheduleLike | null }).schedules ??
    (await resolveDefaultSchedule(supabase));

  const overrideSchedMap = await loadOverrideSchedules(supabase, logs ?? []);
  const holidayMap = await getHolidayMap(supabase, startDate, endDate);

  const cursor = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  while (cursor <= end) {
    const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const dow = cursor.getDay();
    const dayOfWeek = dayNames[dow];
    const isWeekend = dow === 0 || dow === 6;
    const log = logMap.get(dateStr);
    const leaveCode = leaveMap.get(dateStr) ?? null;
    const holiday = holidayMap.get(dateStr) ?? null;
    const holidayType: HolidayType | null = holiday?.type ?? null;
    const holidayName = holiday?.name ?? null;
    const isHalfHoliday =
      holidayType === "half_am" || holidayType === "half_pm";
    const hasPunch =
      !!log &&
      !!(log.time_in_am || log.time_out_am || log.time_in_pm || log.time_out_pm);

    // Full-day holiday with no punches prints HOLIDAY across the row. If the
    // employee actually worked the holiday, fall through so the times show.
    if (holidayType === "full" && !hasPunch) {
      entries.push({
        date: dateStr,
        day_of_week: dayOfWeek,
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
      cursor.setDate(cursor.getDate() + 1);
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
      // Score the day against its pinned override schedule when one is set,
      // otherwise the employee's current assigned schedule.
      const daySched =
        (log.schedule_id
          ? overrideSchedMap.get(log.schedule_id as string)
          : null) ?? empSchedule;
      const lateMins = lateMinutesFor(
        dateStr,
        daySched,
        extractTime(tInAmRaw),
        timestampOnNextDay(tInAmRaw, dateStr),
      );
      const undertimeMins = undertimeMinutesFor(
        dateStr,
        daySched,
        extractTime(tOutPmRaw),
        timestampOnNextDay(tOutPmRaw, dateStr),
        !!tInAmRaw,
        extractTime(tInPmRaw),
        timestampOnNextDay(tInPmRaw, dateStr),
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
        dateStr,
        daySched,
        extractTime(tInPmRaw),
        timestampOnNextDay(tInPmRaw, dateStr),
      );
      const isPmLate =
        !reasonInPm && !holidayExcusesUndertime && pmLateMins > 0;
      // An absent day (already absent, or reclassified by the 8h rule) prints
      // ABSENT across the row, so any partial punches are not shown.
      const showTimes = !dayAbsent;

      entries.push({
        date: dateStr,
        day_of_week: dayOfWeek,
        time_in_am: showTimes ? extractTime(tInAmRaw) : null,
        time_out_am: showTimes ? extractTime(log.time_out_am as string | null) : null,
        time_in_pm: showTimes ? extractTime(log.time_in_pm as string | null) : null,
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
    } else if (!isWeekend && leaveCode) {
      entries.push({
        date: dateStr,
        day_of_week: dayOfWeek,
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
      const absent = !isWeekend && !isHalfHoliday;
      // An absent day is charged a full 8-hour undertime on the DTR.
      const absentUndertime = absent ? UNDERTIME_ABSENT_MINUTES : 0;
      entries.push({
        date: dateStr,
        day_of_week: dayOfWeek,
        time_in_am: null,
        time_out_am: null,
        time_in_pm: null,
        time_out_pm: null,
        is_late: false,
        late_minutes: 0,
        is_undertime: absent,
        undertime_minutes: absentUndertime,
        is_absent: absent,
        remarks: isWeekend ? "Weekend" : isHalfHoliday ? holidayName : null,
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

    cursor.setDate(cursor.getDate() + 1);
  }

  const emp = employee as unknown as BulkDtrEmployee &
    DtrSignatoryFields & {
      departments: DtrSignatoryDeptRow | null;
      schedules: (ScheduleLike & { name: string }) | null;
    };

  const signatoryMap = await resolveSignatories(supabase, [
    {
      id: emp.id,
      is_department_head: emp.is_department_head ?? false,
      homeDept: emp.departments,
      detailedDept: emp.detailed_department,
    },
  ]);

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
      time_in: trimTimeStr(empSchedule.time_in)!,
      time_out: trimTimeStr(empSchedule.time_out)!,
      break_start: trimTimeStr(empSchedule.break_start),
      break_end: trimTimeStr(empSchedule.break_end),
      has_break: hasBreak(empSchedule),
    },
    signatory: signatoryMap.get(emp.id) ?? { name: "", title: "" },
  };
}


// --- Attendance Report (per-employee totals, scoped by dept + date range) ---

export interface AttendanceReportRow {
  employee_id: string;
  employee_name: string;
  department_name: string | null;
  schedule_name: string;
  days_present: number;
  days_absent: number;
  days_on_leave: number;
  late_count: number;
  late_minutes: number;
  undertime_count: number;
  undertime_minutes: number;
  total_deficit_minutes: number;
  leave_credit_days: number; // 3-decimal days, 0.125/hr
}

export async function getAttendanceReport(
  departmentId: string | null,
  startDate: string,
  endDate: string,
): Promise<AttendanceReportRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.role)) {
    throw new Error("Unauthorized");
  }
  if (!startDate || !endDate) throw new Error("Date range required");
  if (startDate > endDate) {
    throw new Error("Start date must be on or before end date");
  }

  const supabase = createAdminClient();

  let empQuery = supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, first_name, last_name, middle_name, departments!employees_department_id_fkey(name), schedules(id, name, time_in, time_out, break_start, break_end)",
    )
    .eq("status", "active")
    .eq("employment_type", "plantilla")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (departmentId) empQuery = empQuery.eq("department_id", departmentId);

  const { data: employees } = await empQuery;
  const empRows = (employees ?? []) as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    middle_name: string | null;
    departments: { name: string } | null;
    schedules: (ScheduleLike & { name: string }) | null;
  }[];

  if (empRows.length === 0) return [];

  const empIds = empRows.map((e) => e.id);

  const [{ data: logs }, { data: leaves }] = await Promise.all([
    supabase
      .schema("hris")
      .from("attendance_logs")
      .select("employee_id, date, time_in_am, time_out_pm, is_absent")
      .in("employee_id", empIds)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .schema("hris")
      .from("leave_applications")
      .select("employee_id, start_date, end_date, leave_dates")
      .in("employee_id", empIds)
      .eq("status", "approved")
      .lte("start_date", endDate)
      .gte("end_date", startDate),
  ]);

  const logsByEmp = new Map<string, Map<string, Record<string, unknown>>>();
  for (const log of (logs ?? []) as Record<string, unknown>[]) {
    const id = log.employee_id as string;
    if (!logsByEmp.has(id)) logsByEmp.set(id, new Map());
    logsByEmp.get(id)!.set(log.date as string, log);
  }

  const leavesByEmp = new Map<string, Set<string>>();
  for (const leave of (leaves ?? []) as {
    employee_id: string;
    start_date: string;
    end_date: string;
    leave_dates: string[] | null;
  }[]) {
    if (!leavesByEmp.has(leave.employee_id)) leavesByEmp.set(leave.employee_id, new Set());
    const set = leavesByEmp.get(leave.employee_id)!;
    const dates = leave.leave_dates;
    if (dates && dates.length > 0) {
      for (const d of dates) set.add(d);
    } else {
      const d = new Date(leave.start_date + "T00:00:00");
      const end = new Date(leave.end_date + "T00:00:00");
      while (d <= end) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          set.add(key);
        }
        d.setDate(d.getDate() + 1);
      }
    }
  }

  // Build the working calendar between startDate and endDate
  const calendar: { date: string; isWeekend: boolean }[] = [];
  {
    const d = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    while (d <= end) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dow = d.getDay();
      calendar.push({ date: dateStr, isWeekend: dow === 0 || dow === 6 });
      d.setDate(d.getDate() + 1);
    }
  }

  // Inclusion is implicit: only employees with attendance logs in the range
  // appear in the report.
  const defaultSched = await resolveDefaultSchedule(supabase);
  return empRows
    .filter((e) => (logsByEmp.get(e.id)?.size ?? 0) > 0)
    .map((emp) => {
    const sched = emp.schedules ?? defaultSched;
    const logMap = logsByEmp.get(emp.id) ?? new Map();
    const leaveSet = leavesByEmp.get(emp.id) ?? new Set<string>();

    let daysPresent = 0;
    let daysAbsent = 0;
    let daysOnLeave = 0;
    let lateCount = 0;
    let lateMinutes = 0;
    let undertimeCount = 0;
    let undertimeMinutes = 0;

    for (const day of calendar) {
      const log = logMap.get(day.date) as Record<string, unknown> | undefined;
      if (log) {
        const isAbsent = (log.is_absent as boolean) ?? false;
        if (isAbsent) {
          daysAbsent++;
        } else {
          const tIn = log.time_in_am as string | null;
          const tInPm = log.time_in_pm as string | null;
          const tOut = log.time_out_pm as string | null;
          const lmRaw = lateMinutesFor(
            day.date,
            sched,
            extractTime(tIn),
            timestampOnNextDay(tIn, day.date),
          );
          const umRaw = undertimeMinutesFor(
            day.date,
            sched,
            extractTime(tOut),
            timestampOnNextDay(tOut, day.date),
            !!tIn,
            extractTime(tInPm),
            timestampOnNextDay(tInPm, day.date),
          );
          // Same DTR rule: undertime caps at 7h; 8h+ counts the day absent.
          const { lateMins: lm, undertimeMins: um, absent } =
            applyUndertimeAbsenceRule(lmRaw, umRaw, false);
          if (absent) {
            daysAbsent++;
          } else {
            daysPresent++;
            if (lm > 0) {
              lateCount++;
              lateMinutes += lm;
            }
            if (um > 0) {
              undertimeCount++;
              undertimeMinutes += um;
            }
          }
        }
      } else if (!day.isWeekend && leaveSet.has(day.date)) {
        daysOnLeave++;
      } else if (!day.isWeekend) {
        daysAbsent++;
      }
    }

    const total = lateMinutes + undertimeMinutes;
    return {
      employee_id: emp.id,
      employee_name: [emp.last_name, emp.first_name].filter(Boolean).join(", "),
      department_name: emp.departments?.name ?? null,
      schedule_name: emp.schedules?.name ?? "Default 8:00–17:00",
      days_present: daysPresent,
      days_absent: daysAbsent,
      days_on_leave: daysOnLeave,
      late_count: lateCount,
      late_minutes: lateMinutes,
      undertime_count: undertimeCount,
      undertime_minutes: undertimeMinutes,
      total_deficit_minutes: total,
      leave_credit_days: Number((total / 480).toFixed(3)),
    };
  });
}

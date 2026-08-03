// Builds a hris.attendance_logs row from HH:MM punch fields and a schedule.
//
// Extracted from attendance-actions.ts so non-server code can use it: a
// "use server" module may only export async functions, which put this out of
// reach of both the correction apply path and unit tests. Behaviour is
// unchanged — attendance-actions.ts now re-exports from here.

import {
  dayLateUndertime,
  timeOnNextDayForNightShift,
  type ScheduleLike,
} from "./attendance-schedule.ts";

export interface AttendanceTimeFields {
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  schedule_id?: string | null;
  remarks?: string | null;
  no_time_reason?: string | null;
  reason_in_am?: string | null;
  reason_out_am?: string | null;
  reason_in_pm?: string | null;
  reason_out_pm?: string | null;
}

function toTimestamp(date: string, time: string | null): string | null {
  if (!time) return null;
  return `${date}T${time}:00`;
}

function addDaysIso(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function computeAttendanceFlags(
  entry: {
    time_in_am: string | null;
    time_out_am: string | null;
    time_in_pm: string | null;
    time_out_pm: string | null;
    time_in_am_next_day?: boolean;
    time_in_pm_next_day?: boolean;
    time_out_pm_next_day?: boolean;
    // A slot's reason explains why its punch is missing, so the session it
    // belongs to is not charged the flat half day. Absent on the import path,
    // where the device reports punches and nothing else.
    reason_in_am?: string | null;
    reason_out_am?: string | null;
    reason_in_pm?: string | null;
    reason_out_pm?: string | null;
    /** A day-level reason (OFF / holiday / a weekend) excuses both sessions. */
    no_time_reason?: string | null;
  },
  dutyDate: string,
  sched: ScheduleLike,
) {
  const hasAnyLog =
    entry.time_in_am || entry.time_out_am || entry.time_in_pm || entry.time_out_pm;
  const dayExcused = !!entry.no_time_reason;
  const { lateMinutes, undertimeMinutes } = dayLateUndertime(
    dutyDate,
    sched,
    entry,
    {
      reasons: {
        in_am: !!entry.reason_in_am,
        out_am: !!entry.reason_out_am,
        in_pm: !!entry.reason_in_pm,
        out_pm: !!entry.reason_out_pm,
      },
      excuseAm: dayExcused,
      excusePm: dayExcused,
    },
  );

  return {
    is_late: lateMinutes > 0,
    late_minutes: lateMinutes,
    is_undertime: undertimeMinutes > 0,
    undertime_minutes: undertimeMinutes,
    is_absent: !hasAnyLog,
  };
}

export function buildAttendanceRecord(
  employeeId: string,
  date: string,
  fields: AttendanceTimeFields,
  sched: ScheduleLike,
) {
  // A night-shift HH:MM rolls to the next calendar day only when it falls in
  // the early-morning portion of the shift (per the off-shift midpoint). This
  // keeps an on-time evening clock-in (22:00 for a 22:00–05:00 shift) on the
  // duty date instead of mis-dating it a day ahead.
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
      time_in_pm_next_day: nextDay(fields.time_in_pm),
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
    !!noTimeReason || !!reasonInAm || !!reasonOutAm || !!reasonInPm || !!reasonOutPm;

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
    // An official-duty reason excuses the missing punch: the day is on duty
    // (not absent), and the charge tied to the excused slot is dropped. The
    // dropping happens per SESSION inside computeAttendanceFlags — a reason on
    // the afternoon must not also erase an unaccounted morning, which is what
    // a blanket "reason_out_pm zeroes all undertime" override did.
    ...flags,
    ...(hasAnyReason ? { is_absent: false } : {}),
  };
}

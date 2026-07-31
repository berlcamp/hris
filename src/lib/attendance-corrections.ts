// Pure logic for turning a proposed correction item into the hris.attendance_logs
// row that approval will write. Shares buildAttendanceRecord with manual entry so
// a corrected day is indistinguishable from a hand-entered one — except for
// correction_locked, which protects it from a later biometric overwrite.

import { buildAttendanceRecord } from "./attendance-record.ts";
import { crossesMidnight, type ScheduleLike } from "./attendance-schedule.ts";
import type { CorrectionReason } from "@/lib/constants";

export type Disposition = "update" | "clear_as_off";

export interface CorrectionItemInput {
  /** Duty date, YYYY-MM-DD. */
  duty_date: string;
  disposition: Disposition;
  /** Already-resolved schedule — see resolveCorrectionSchedule. */
  schedule: ScheduleLike;
  /** The pinned schedule's id, or null to inherit. Written to attendance_logs. */
  scheduleId: string | null;
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  reason_in_am: CorrectionReason | null;
  reason_out_am: CorrectionReason | null;
  reason_in_pm: CorrectionReason | null;
  reason_out_pm: CorrectionReason | null;
  /**
   * Free-text note written onto the attendance row itself — the request's
   * narrative, repeated per day.
   *
   * attendance_logs.remarks is not otherwise reachable through this workflow,
   * so without it applying a correction blanked whatever remark the day carried
   * (buildAttendanceRecord writes `fields.remarks || null`). Manual entry had a
   * remarks box; corrections now carry the same information, sourced from the
   * one field that already explains why the day is being changed.
   */
  remarks?: string | null;
}

// Which schedule a corrected day is measured against, most specific first.
// Mirrors how the DTR builders resolve a day: the per-day pin wins, then the
// employee's assignment, then the org default.
export function resolveCorrectionSchedule(
  itemPin: ScheduleLike | null,
  rowPin: ScheduleLike | null,
  employeeSchedule: ScheduleLike | null,
  orgDefault: ScheduleLike,
): ScheduleLike {
  return itemPin ?? rowPin ?? employeeSchedule ?? orgDefault;
}

export interface ResolvedItemSchedule {
  schedule: ScheduleLike;
  // The item's own proposed_schedule_id was set but no longer resolves to a
  // schedule row (e.g. deleted between submit and approval). Should be
  // unreachable in practice — attendance_correction_items_proposed_schedule_id_fkey
  // is ON DELETE NO ACTION (migration 065), so Postgres blocks deleting a
  // schedule any live item still references — but callers key their
  // needs_rebase decision off this flag as defense-in-depth rather than
  // trusting the FK alone.
  itemPinMissing: boolean;
}

// The pure core of schedule resolution for a whole request: given maps
// already batch-fetched from the database (one query for row pins, one for
// every schedule referenced), resolves each item's schedule the same way
// resolveCorrectionSchedule does, one item at a time.
//
// Extracted so approveCorrectionRequest and getCorrectionReviewSummary
// (attendance-correction-actions.ts) share ONE resolution instead of each
// re-deriving it — the bug this closes is exactly a case of two independent
// re-derivations drifting apart (the review summary hard-coded rowPin to
// null, so it under- or over-stated forgiven minutes for any day carrying a
// row-level schedule override). Pure and DB-free, so it is unit-testable
// without a running stack or an authenticated request context.
export function resolveItemSchedules<
  T extends {
    // Nullable since migration 067: a CREATE item targets a date with no
    // attendance row, so it has no row-level pin and resolution falls through
    // to the employee's schedule.
    attendance_log_id: string | null;
    proposed_schedule_id: string | null;
  },
>(
  items: readonly T[],
  scheduleById: ReadonlyMap<string, ScheduleLike>,
  rowScheduleIdByLogId: ReadonlyMap<string, string | null>,
  employeeSchedule: ScheduleLike | null,
  orgDefault: ScheduleLike,
): ResolvedItemSchedule[] {
  return items.map((item) => {
    const itemPinMissing =
      !!item.proposed_schedule_id && !scheduleById.has(item.proposed_schedule_id);
    const itemPin = item.proposed_schedule_id
      ? (scheduleById.get(item.proposed_schedule_id) ?? null)
      : null;
    const rowScheduleId = item.attendance_log_id
      ? (rowScheduleIdByLogId.get(item.attendance_log_id) ?? null)
      : null;
    const rowPin = rowScheduleId ? (scheduleById.get(rowScheduleId) ?? null) : null;
    return {
      schedule: resolveCorrectionSchedule(itemPin, rowPin, employeeSchedule, orgDefault),
      itemPinMissing,
    };
  });
}

// Day of week (0 = Sunday) for a YYYY-MM-DD string, computed through Date.UTC
// rather than `new Date(iso + "T00:00:00")`. The latter parses as LOCAL time,
// so the same date can land on a different weekday depending on where the
// caller runs — and this value is shared by the server action and the browser.
export function dayOfWeekFor(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// The reason code a weekend day defaults to when it carries no punches, so the
// day reads as a rest day instead of an absence. Weekdays get null: a blank
// weekday is a real absence until somebody says otherwise, and defaulting one
// would quietly erase it.
export function weekendReasonFor(iso: string): "saturday" | "sunday" | null {
  const dow = dayOfWeekFor(iso);
  if (dow === 6) return "saturday";
  if (dow === 0) return "sunday";
  return null;
}

// Every date from `from` to `to` inclusive, as YYYY-MM-DD. Used to build the
// correction grid, which now lists dates with no attendance row alongside
// those that have one.
export function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  const cursor = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

// A midnight-crossing shift starting on `dateTo` finishes the NEXT morning, so
// its punches land on dateTo's duty date and the following calendar day is left
// empty. That trailing day needs an explicit disposition or it reads as an
// absence. Day shifts return null — they touch only the days in range.
export function trailingDutyDate(
  dateTo: string,
  sched: ScheduleLike,
): string | null {
  if (!crossesMidnight(sched)) return null;
  const d = new Date(dateTo + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function buildCorrectionRecord(
  employeeId: string,
  item: CorrectionItemInput,
) {
  // clear_as_off discards any proposed times and marks the whole day OFF. Used
  // for the day a night-shift re-pin empties out: without a reason the row has
  // no punches and computeAttendanceFlags would mark it ABSENT.
  const fields =
    item.disposition === "clear_as_off"
      ? {
          time_in_am: null,
          time_out_am: null,
          time_in_pm: null,
          time_out_pm: null,
          schedule_id: item.scheduleId,
          // no_time_reason states the fact about the WHOLE day, which is what
          // clear_as_off means. Without it the DTR had only four per-slot
          // reasons and no day-level label, so a cleared day that happened to
          // fall on a declared holiday printed HOLIDAY — the calendar
          // overriding an explicit human statement about that day.
          no_time_reason: "off",
          reason_in_am: "off",
          reason_out_am: "off",
          reason_in_pm: "off",
          reason_out_pm: "off",
        }
      : {
          time_in_am: item.time_in_am,
          time_out_am: item.time_out_am,
          time_in_pm: item.time_in_pm,
          time_out_pm: item.time_out_pm,
          schedule_id: item.scheduleId,
          reason_in_am: item.reason_in_am,
          reason_out_am: item.reason_out_am,
          reason_in_pm: item.reason_in_pm,
          reason_out_pm: item.reason_out_pm,
        };

  return {
    ...buildAttendanceRecord(
      employeeId,
      item.duty_date,
      { ...fields, remarks: item.remarks ?? null },
      item.schedule,
    ),
    // Excluded from both import paths even with "overwrite existing" ON.
    correction_locked: true,
  };
}

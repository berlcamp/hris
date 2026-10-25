// Which schedule applies to an employee on a given date, and whether that date
// is a rest day (Phase 2: rotations and per-date overrides, migration 094).
//
// Most specific first:
//   1. a schedule pinned on that day's attendance row by an approved correction
//      (attendance_logs.schedule_id) — a working day by definition;
//   2. a per-date override (hris.schedule_overrides) — a schedule, or a rest day;
//   3. the rotation in effect (hris.employee_rotation_assignments) — week of the
//      cycle × ISO weekday → a schedule, or REST;
//   4. the employee's base schedule (employees.schedule_id, else the org
//      default) Monday to Friday, with Saturday and Sunday as rest days — what
//      the system did before rotations existed.
//
// Pure: the caller loads the rows (schedule-context.ts) and hands them over.
// hris.resolve_day_schedule (migration 094) mirrors this for the VL deduction.

import {
  dayOfWeekFor,
  isRestDay,
  timeOnNextDayForNightShift,
  type ScheduleLike,
} from "./attendance-schedule.ts";

export interface RotationDef {
  id: string;
  cycle_weeks: number;
  /** `${week_no}-${isoWeekday}` → schedule id, or null for REST. A missing
   *  key is REST too. ISO weekday: 1 = Monday … 7 = Sunday. */
  days: Record<string, string | null>;
}

export interface RotationAssignment {
  /** null ends a rotation: the base schedule applies again from this date. */
  rotation_id: string | null;
  effective_from: string;
  /** Which week of the cycle the effective date's week is (1-based). */
  start_week: number;
}

export interface ScheduleOverride {
  date: string;
  schedule_id: string | null;
  is_rest_day: boolean;
}

export interface DaySchedule {
  sched: ScheduleLike;
  restDay: boolean;
  source: "pin" | "override" | "rotation" | "base";
}

export interface ResolveInput {
  /** The employee's assigned schedule, else the org default. */
  base: ScheduleLike;
  schedules: Map<string, ScheduleLike>;
  rotations: Map<string, RotationDef>;
  /** This employee's assignments, any order. */
  assignments: RotationAssignment[];
  override?: ScheduleOverride | null;
  pin?: ScheduleLike | null;
}

const DAY_MS = 86_400_000;

function utcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function isoWeekday(iso: string): number {
  const dow = dayOfWeekFor(iso);
  return dow === 0 ? 7 : dow;
}

function mondayMs(iso: string): number {
  return utcMs(iso) - (isoWeekday(iso) - 1) * DAY_MS;
}

function addDaysIso(iso: string, delta: number): string {
  return new Date(utcMs(iso) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** The week of the rotation cycle (1-based) that `date` falls in. Weeks run
 *  Monday to Sunday, counted from the Monday of the effective date's week. */
export function rotationWeekFor(
  date: string,
  assignment: Pick<RotationAssignment, "effective_from" | "start_week">,
  cycleWeeks: number,
): number {
  const weeks = Math.floor((mondayMs(date) - mondayMs(assignment.effective_from)) / (7 * DAY_MS));
  const offset = assignment.start_week - 1 + weeks;
  return (((offset % cycleWeeks) + cycleWeeks) % cycleWeeks) + 1;
}

export function resolveDaySchedule(date: string, input: ResolveInput): DaySchedule {
  if (input.pin) return { sched: input.pin, restDay: false, source: "pin" };

  const o = input.override;
  if (o && o.date === date) {
    if (o.is_rest_day) return { sched: input.base, restDay: true, source: "override" };
    const s = o.schedule_id ? input.schedules.get(o.schedule_id) : undefined;
    if (s) return { sched: s, restDay: false, source: "override" };
  }

  let current: RotationAssignment | null = null;
  for (const a of input.assignments) {
    if (a.effective_from <= date && (!current || a.effective_from > current.effective_from)) {
      current = a;
    }
  }
  const rotation = current?.rotation_id ? input.rotations.get(current.rotation_id) : undefined;
  if (current && rotation) {
    const week = rotationWeekFor(date, current, rotation.cycle_weeks);
    const scheduleId = rotation.days[`${week}-${isoWeekday(date)}`] ?? null;
    const s = scheduleId ? input.schedules.get(scheduleId) : undefined;
    // Punches on a rest day still print; they are read against the base hours.
    if (!s) return { sched: input.base, restDay: true, source: "rotation" };
    return { sched: s, restDay: false, source: "rotation" };
  }

  return { sched: input.base, restDay: isRestDay(date), source: "base" };
}

/**
 * The duty date a punch belongs to. An early-morning punch belongs to the day
 * before only when THAT day was a night shift — so a night worker's 06:00
 * clock-out files under the night it began, while the same employee's 08:00
 * arrival on a day-shift day stays on its own date. A rest day never claims
 * the next morning's punches.
 */
export function dutyDateForPunch(
  punchDate: string,
  time: string,
  previousDay: DaySchedule,
): string {
  if (previousDay.restDay) return punchDate;
  return timeOnNextDayForNightShift(time.slice(0, 5), previousDay.sched)
    ? addDaysIso(punchDate, -1)
    : punchDate;
}

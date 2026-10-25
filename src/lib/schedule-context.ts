// Loads everything resolveDaySchedule needs for a set of employees over a date
// range, in a handful of queries, and returns a resolver for (employee, date).
//
// Used by the punch pool's re-sort, the DTR builder and the attendance report,
// so all three read the same schedule and rest day for every day. A plain
// module (not "use server"): it authorizes nothing, and every caller checks the
// user first. Relative .ts imports keep it loadable by the node test runner.

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SCHEDULE, type ScheduleLike } from "./attendance-schedule.ts";
import { selectAll } from "./postgrest-paging.ts";
import {
  resolveDaySchedule,
  type DaySchedule,
  type RotationAssignment,
  type RotationDef,
  type ScheduleOverride,
} from "./schedule-resolver.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type ScheduleResolver = (
  employeeId: string,
  date: string,
  /** A correction's pinned schedule on that day's attendance row, if any. */
  pin?: ScheduleLike | null,
) => DaySchedule;

const EMPLOYEE_CHUNK = 50;
const SCHEDULE_COLS = "id, time_in, time_out, break_start, break_end";

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/**
 * `from`/`to` bound the dates the resolver will be asked about. Overrides are
 * loaded one day either side, because the duty date of a night-shift punch
 * depends on the day before it.
 */
export async function loadScheduleContext(
  db: Db,
  employeeIds: string[],
  from: string,
  to: string,
): Promise<ScheduleResolver> {
  const ids = [...new Set(employeeIds)];
  const hris = () => db.schema("hris");

  const [{ data: scheduleRows, error: sErr }, rotationRows, dayRows] = await Promise.all([
    hris().from("schedules").select(`${SCHEDULE_COLS}, is_default`),
    selectAll<{ id: string; cycle_weeks: number }>((a, b) =>
      hris().from("schedule_rotations").select("id, cycle_weeks").order("id").range(a, b),
    ),
    selectAll<{ rotation_id: string; week_no: number; iso_weekday: number; schedule_id: string | null }>(
      (a, b) =>
        hris()
          .from("schedule_rotation_days")
          .select("rotation_id, week_no, iso_weekday, schedule_id")
          .order("rotation_id")
          .order("week_no")
          .order("iso_weekday")
          .range(a, b),
    ),
  ]);
  if (sErr) throw new Error(sErr.message);

  const schedules = new Map<string, ScheduleLike>();
  let defaultSched: ScheduleLike = DEFAULT_SCHEDULE;
  for (const s of (scheduleRows ?? []) as (ScheduleLike & { is_default: boolean })[]) {
    schedules.set(s.id, s);
    if (s.is_default) defaultSched = s;
  }

  const rotations = new Map<string, RotationDef>();
  for (const r of rotationRows) rotations.set(r.id, { id: r.id, cycle_weeks: r.cycle_weeks, days: {} });
  for (const d of dayRows) {
    const rot = rotations.get(d.rotation_id);
    if (rot) rot.days[`${d.week_no}-${d.iso_weekday}`] = d.schedule_id;
  }

  const baseByEmp = new Map<string, ScheduleLike>();
  const assignmentsByEmp = new Map<string, RotationAssignment[]>();
  const overrides = new Map<string, ScheduleOverride>();
  for (let i = 0; i < ids.length; i += EMPLOYEE_CHUNK) {
    const chunk = ids.slice(i, i + EMPLOYEE_CHUNK);
    const [emps, asg, ovr] = await Promise.all([
      selectAll<{ id: string; schedule_id: string | null }>((a, b) =>
        hris().from("employees").select("id, schedule_id").in("id", chunk).order("id").range(a, b),
      ),
      selectAll<RotationAssignment & { employee_id: string }>((a, b) =>
        hris()
          .from("employee_rotation_assignments")
          .select("employee_id, rotation_id, effective_from, start_week")
          .in("employee_id", chunk)
          .lte("effective_from", addDaysIso(to, 1))
          .order("id")
          .range(a, b),
      ),
      selectAll<ScheduleOverride & { employee_id: string }>((a, b) =>
        hris()
          .from("schedule_overrides")
          .select("employee_id, date, schedule_id, is_rest_day")
          .in("employee_id", chunk)
          .gte("date", addDaysIso(from, -1))
          .lte("date", addDaysIso(to, 1))
          .order("id")
          .range(a, b),
      ),
    ]);
    for (const e of emps) {
      baseByEmp.set(e.id, (e.schedule_id && schedules.get(e.schedule_id)) || defaultSched);
    }
    for (const a of asg) {
      if (!assignmentsByEmp.has(a.employee_id)) assignmentsByEmp.set(a.employee_id, []);
      assignmentsByEmp.get(a.employee_id)!.push(a);
    }
    for (const o of ovr) overrides.set(`${o.employee_id}_${o.date}`, o);
  }

  return (employeeId, date, pin = null) =>
    resolveDaySchedule(date, {
      base: baseByEmp.get(employeeId) ?? defaultSched,
      schedules,
      rotations,
      assignments: assignmentsByEmp.get(employeeId) ?? [],
      override: overrides.get(`${employeeId}_${date}`) ?? null,
      pin,
    });
}

// The raw punch pool (hris.attendance_punches, migration 091) and the one path
// that turns it into attendance_logs rows.
//
// An import no longer buckets its own file. It adds the file's punches to the
// pool (storePunches), then re-sorts every employee-day those punches touched
// from ALL of the employee's pooled punches (resortDaysForPunches) — so a day
// that began at Building 1's device and ended at Building 3's comes out whole,
// whichever file was imported first. Replay goes through the same re-sort.
//
// A plain module, not "use server": nothing here authorizes anything, and an
// exported writer that skips authorization must not become a network-reachable
// endpoint. Every caller checks the user first. Relative .ts imports keep it
// loadable by the node test runner.

import type { SupabaseClient } from "@supabase/supabase-js";
import { bucketPunchesForDuty, type ScheduleLike } from "./attendance-schedule.ts";
import { computeAttendanceFlags } from "./attendance-record.ts";
import { selectAll } from "./postgrest-paging.ts";
import { loadScheduleContext } from "./schedule-context.ts";
import { dutyDateForPunch } from "./schedule-resolver.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/** One punch as parsed from a device export, ready for the pool. */
export interface PoolPunchInput {
  employeeNo: string;
  employeeName: string;
  /** Resolved from employees.biometric_no; null when nothing matched. */
  employeeId: string | null;
  /** YYYY-MM-DD, device wall-clock. */
  date: string;
  /** HH:MM or HH:MM:SS, device wall-clock. */
  time: string;
  status: string;
}

/** A punch that identifies an employee-day to re-sort. */
export interface ResortSeed {
  employeeId: string;
  date: string;
  time: string;
}

export interface ResortResult {
  /** attendance_logs rows written. */
  written: number;
  /** Days left alone because a person authored them. */
  protectedSkipped: number;
  /** Device-written rows removed because their punches now belong to another
   *  duty day (a night shift claiming the next morning). */
  cleared: number;
  errors: number;
  /** Employee-days the seeds resolved to. */
  dayRecords: number;
  /** (employee, month) pairs written — for the VL deduction refresh. */
  touched: { employeeId: string; year: number; month: number }[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const WRITE_CHUNK = 500;
// Keeps `.in("employee_id", …)` well inside PostgREST's URL limit.
const EMPLOYEE_CHUNK = 50;

const hhmm = (t: string) => t.slice(0, 5);
const toSeconds = (t: string) => (t.length === 5 ? `${t}:00` : t.slice(0, 8));

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function toTimestamp(date: string, time: string | null): string | null {
  return time ? `${date}T${time}:00` : null;
}

/**
 * Dahua face devices fire the same event 2–3 times within seconds (one
 * "Check In" recorded at 07:54:34/37/40). Compared at HH:MM these become
 * identical punches that overflow the AM/PM slots in bucketPunchesForDuty,
 * pushing the real Break-Out / Check-Out into the wrong column. Collapse a run
 * of punches that share the same minute, or share the same device status and
 * land within 2 minutes of each other (the burst), keeping the earliest — so
 * each real event survives exactly once. Punches far apart in time are never
 * merged, even with the same status. With several devices in the pool this
 * also collapses one scan registered by two devices side by side.
 */
export function dedupePunches(
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
 * Adds parsed punches to the pool. A punch already there (same employee
 * number, date, time to the second, and device) is skipped, so uploading the
 * same file again — or two exports that overlap — adds nothing.
 */
export async function storePunches(
  db: Db,
  rows: PoolPunchInput[],
  ctx: { deviceId: string | null; batchId: string | null },
): Promise<{ inserted: number; duplicates: number; invalid: number }> {
  let invalid = 0;
  const records: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (!r.employeeNo?.trim() || !DATE_RE.test(r.date) || !TIME_RE.test(r.time)) {
      invalid++;
      continue;
    }
    records.push({
      employee_no: r.employeeNo.trim(),
      employee_name: r.employeeName?.trim() || null,
      employee_id: r.employeeId,
      punch_date: r.date,
      punch_time: toSeconds(r.time),
      device_status: (r.status ?? "").trim().toLowerCase(),
      device_id: ctx.deviceId,
      import_batch_id: ctx.batchId,
      source: "biometric",
    });
  }

  let inserted = 0;
  for (let i = 0; i < records.length; i += WRITE_CHUNK) {
    const chunk = records.slice(i, i + WRITE_CHUNK);
    const { data, error } = await db
      .schema("hris")
      .from("attendance_punches")
      .upsert(chunk, {
        onConflict: "employee_no,punch_date,punch_time,device_id",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw new Error(error.message);
    inserted += data?.length ?? 0;
  }
  return { inserted, duplicates: records.length - inserted, invalid };
}

/**
 * Re-sorts every employee-day the seed punches belong to, from ALL of that
 * employee's pooled punches, and writes the result to attendance_logs.
 *
 * Each day is read against the schedule that applies to it (resolveDaySchedule:
 * a correction's pin, a per-date override, the rotation in effect, else the
 * employee's base schedule), and a rest day is charged nothing. A punch belongs
 * to the day before only when that day was a night shift (dutyDateForPunch), so
 * an employee rotating between nights and days keeps each punch on the right
 * duty day. A day a person authored (source other than
 * 'biometric', or correction_locked) is never overwritten; its punches stay in
 * the pool for the officer to see.
 *
 * `dryRun` resolves the days and counts what would be written or protected
 * without writing anything (the replay preview).
 */
export async function resortDaysForPunches(
  db: Db,
  seeds: ResortSeed[],
  opts: { dryRun?: boolean } = {},
): Promise<ResortResult> {
  const result: ResortResult = {
    written: 0,
    protectedSkipped: 0,
    cleared: 0,
    errors: 0,
    dayRecords: 0,
    touched: [],
  };
  const employeeIds = [...new Set(seeds.map((s) => s.employeeId))];
  if (employeeIds.length === 0) return result;

  // Every seed's duty date depends on the schedule of the day before it, so
  // the context covers one day either side of the seeds.
  const seedDates = seeds.map((s) => s.date).filter((d) => DATE_RE.test(d)).sort();
  if (seedDates.length === 0) return result;
  const resolve = await loadScheduleContext(
    db,
    employeeIds,
    addDaysIso(seedDates[0], -1),
    addDaysIso(seedDates[seedDates.length - 1], 1),
  );
  const dutyOf = (employeeId: string, date: string, time: string) =>
    dutyDateForPunch(date, time, resolve(employeeId, addDaysIso(date, -1)));

  // employeeId → set of days to re-sort: each seed's duty date, and its own
  // calendar date. The calendar date matters when a schedule change moves its
  // punches onto the night before — the row they used to make up is stale.
  const targets = new Map<string, Set<string>>();
  for (const s of seeds) {
    if (!DATE_RE.test(s.date) || !TIME_RE.test(s.time)) continue;
    const duty = dutyOf(s.employeeId, s.date, hhmm(s.time));
    if (!targets.has(s.employeeId)) targets.set(s.employeeId, new Set());
    targets.get(s.employeeId)!.add(duty).add(s.date);
  }

  const pinCache = new Map<string, ScheduleLike>();
  const records: Record<string, unknown>[] = [];
  const staleIds: string[] = [];
  const staleTouched: ResortResult["touched"] = [];
  const recordTouched: ResortResult["touched"] = [];

  const targetEmps = [...targets.keys()];
  for (let i = 0; i < targetEmps.length; i += EMPLOYEE_CHUNK) {
    const ids = targetEmps.slice(i, i + EMPLOYEE_CHUNK);
    const allDuty = ids.flatMap((id) => [...targets.get(id)!]).sort();
    const minDuty = allDuty[0];
    const maxDuty = allDuty[allDuty.length - 1];

    // A duty day's punches fall on the duty date or, for a night shift, the
    // morning after — so one extra day past the last duty date covers them.
    const punches = await selectAll<{
      employee_id: string;
      punch_date: string;
      punch_time: string;
      device_status: string;
    }>((from, to) =>
      db
        .schema("hris")
        .from("attendance_punches")
        .select("employee_id, punch_date, punch_time, device_status")
        .in("employee_id", ids)
        .gte("punch_date", minDuty)
        .lte("punch_date", addDaysIso(maxDuty, 1))
        .order("id")
        .range(from, to),
    );

    const existing = await selectAll<{
      id: string;
      employee_id: string;
      date: string;
      schedule_id: string | null;
      source: string | null;
      correction_locked: boolean | null;
    }>((from, to) =>
      db
        .schema("hris")
        .from("attendance_logs")
        .select("id, employee_id, date, schedule_id, source, correction_locked")
        .in("employee_id", ids)
        .gte("date", minDuty)
        .lte("date", maxDuty)
        .order("id")
        .range(from, to),
    );
    const existingByKey = new Map(
      existing.map((r) => [`${r.employee_id}_${r.date}`, r]),
    );

    const missingPins = [
      ...new Set(
        existing
          .map((r) => r.schedule_id)
          .filter((id): id is string => !!id && !pinCache.has(id)),
      ),
    ];
    if (missingPins.length > 0) {
      const { data, error } = await db
        .schema("hris")
        .from("schedules")
        .select("id, time_in, time_out, break_start, break_end")
        .in("id", missingPins);
      if (error) throw new Error(error.message);
      for (const s of (data ?? []) as ScheduleLike[]) pinCache.set(s.id, s);
    }

    // Group the pooled punches by employee + duty date, keeping only the days
    // asked for.
    const grouped = new Map<string, { date: string; time: string; status: string }[]>();
    for (const p of punches) {
      const time = hhmm(p.punch_time);
      const duty = dutyOf(p.employee_id, p.punch_date, time);
      if (!targets.get(p.employee_id)?.has(duty)) continue;
      const key = `${p.employee_id}_${duty}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push({ date: p.punch_date, time, status: p.device_status });
    }

    for (const id of ids) {
      for (const duty of targets.get(id)!) {
        const key = `${id}_${duty}`;
        const dayPunches = grouped.get(key);
        const prior = existingByKey.get(key);
        if (!dayPunches || dayPunches.length === 0) {
          // A date whose punches now all belong to another duty day. A row the
          // device wrote there is stale; a row a person wrote, or one carrying
          // a pinned schedule, is left alone.
          if (
            prior &&
            prior.source === "biometric" &&
            !prior.correction_locked &&
            !prior.schedule_id
          ) {
            staleIds.push(prior.id);
            const [yr, mo] = duty.split("-").map(Number) as [number, number];
            staleTouched.push({ employeeId: id, year: yr, month: mo });
          }
          continue;
        }
        result.dayRecords++;

        if (
          prior &&
          ((prior.source !== null && prior.source !== "biometric") ||
            prior.correction_locked)
        ) {
          result.protectedSkipped++;
          continue;
        }

        try {
          // A correction's pin on the existing row wins; otherwise the day's
          // rotation / override / base schedule.
          const pin = prior?.schedule_id
            ? pinCache.get(prior.schedule_id) ?? null
            : null;
          const day = resolve(id, duty, pin);
          const sched = day.sched;
          const bucket = bucketPunchesForDuty(dedupePunches(dayPunches), duty, sched);
          const flags = computeAttendanceFlags(
            {
              time_in_am: bucket.time_in_am,
              time_out_am: bucket.time_out_am,
              time_in_pm: bucket.time_in_pm,
              time_out_pm: bucket.time_out_pm,
              time_in_am_next_day: bucket.time_in_am_next_day,
              time_in_pm_next_day: bucket.time_in_pm_next_day,
              time_out_pm_next_day: bucket.time_out_pm_next_day,
            },
            duty,
            sched,
            { restDay: day.restDay },
          );
          const next = addDaysIso(duty, 1);
          const on = (nextDay: boolean) => (nextDay ? next : duty);
          records.push({
            employee_id: id,
            date: duty,
            schedule_id: pin?.id ?? null,
            time_in_am: toTimestamp(on(bucket.time_in_am_next_day), bucket.time_in_am),
            time_out_am: toTimestamp(on(bucket.time_out_am_next_day), bucket.time_out_am),
            time_in_pm: toTimestamp(on(bucket.time_in_pm_next_day), bucket.time_in_pm),
            time_out_pm: toTimestamp(on(bucket.time_out_pm_next_day), bucket.time_out_pm),
            ...flags,
            source: "biometric",
            remarks: null,
          });
          const [yr, mo] = duty.split("-").map(Number) as [number, number];
          recordTouched.push({ employeeId: id, year: yr, month: mo });
        } catch {
          result.errors++;
        }
      }
    }
  }

  if (opts.dryRun) {
    result.written = records.length;
    result.cleared = staleIds.length;
    return result;
  }

  for (let i = 0; i < staleIds.length; i += WRITE_CHUNK) {
    const { error } = await db
      .schema("hris")
      .from("attendance_logs")
      .delete()
      .in("id", staleIds.slice(i, i + WRITE_CHUNK));
    if (error) {
      result.errors += Math.min(WRITE_CHUNK, staleIds.length - i);
      continue;
    }
    result.cleared += Math.min(WRITE_CHUNK, staleIds.length - i);
    result.touched.push(...staleTouched.slice(i, i + WRITE_CHUNK));
  }

  for (let i = 0; i < records.length; i += WRITE_CHUNK) {
    const chunk = records.slice(i, i + WRITE_CHUNK);
    const { data, error } = await db
      .schema("hris")
      .from("attendance_logs")
      .upsert(chunk, { onConflict: "employee_id,date", ignoreDuplicates: false })
      .select("id");
    if (error) {
      result.errors += chunk.length;
      continue;
    }
    result.written += data?.length ?? 0;
    result.touched.push(...recordTouched.slice(i, i + WRITE_CHUNK));
  }
  return result;
}

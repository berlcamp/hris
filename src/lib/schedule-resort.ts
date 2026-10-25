// Re-sorting saved punches after a schedule change (Phase 2).
//
// A rotation assignment, a per-date override or a new base schedule changes
// which cells a day's punches belong in. The affected days are rebuilt from the
// raw punch pool right away (resortDaysForPunches), hand-corrected days are
// left alone, and the caller refreshes the VL deduction for the months touched.
//
// A plain module: it authorizes nothing; the server actions that call it do.

import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAll } from "./postgrest-paging.ts";
import { resortDaysForPunches, type ResortResult } from "./punch-pool.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

const EMPLOYEE_CHUNK = 50;

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/**
 * The dates a change effective from `effectiveFrom` re-sorts: from that date,
 * but never before the first day of the previous month — older months are
 * usually finalized and printed, and are re-sorted only on purpose (replay).
 * null when the change starts after today.
 */
export function resortWindow(
  effectiveFrom: string,
  today: string,
): { from: string; to: string } | null {
  if (effectiveFrom > today) return null;
  const [y, m] = today.split("-").map(Number) as [number, number];
  const floor = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  return { from: effectiveFrom > floor ? effectiveFrom : floor, to: today };
}

/**
 * Re-sorts every pooled punch the employees have between `from` and `to`. The
 * morning after `to` is included, since it can belong to `to`'s night shift.
 */
export async function resortEmployeesInRange(
  db: Db,
  employeeIds: string[],
  from: string,
  to: string,
): Promise<ResortResult> {
  const total: ResortResult = {
    written: 0,
    protectedSkipped: 0,
    cleared: 0,
    errors: 0,
    dayRecords: 0,
    touched: [],
  };
  const ids = [...new Set(employeeIds)];
  for (let i = 0; i < ids.length; i += EMPLOYEE_CHUNK) {
    const chunk = ids.slice(i, i + EMPLOYEE_CHUNK);
    const punches = await selectAll<{
      employee_id: string;
      punch_date: string;
      punch_time: string;
    }>((a, b) =>
      db
        .schema("hris")
        .from("attendance_punches")
        .select("employee_id, punch_date, punch_time")
        .in("employee_id", chunk)
        .gte("punch_date", from)
        .lte("punch_date", addDaysIso(to, 1))
        .order("id")
        .range(a, b),
    );
    if (punches.length === 0) continue;
    const r = await resortDaysForPunches(
      db,
      punches.map((p) => ({ employeeId: p.employee_id, date: p.punch_date, time: p.punch_time })),
    );
    total.written += r.written;
    total.protectedSkipped += r.protectedSkipped;
    total.cleared += r.cleared;
    total.errors += r.errors;
    total.dayRecords += r.dayRecords;
    total.touched.push(...r.touched);
  }
  return total;
}

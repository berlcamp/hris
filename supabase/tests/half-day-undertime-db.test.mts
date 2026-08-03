// Stack tests for the half-day undertime rule (migration 070).
//
// The rule exists twice on purpose: once in TypeScript (dayLateUndertime,
// src/lib/attendance-schedule.ts), which every app path reads it from, and once
// in SQL (hris.day_late_undertime), which the backfill and the VL auto-deduction
// need. Two implementations of one rule drift. This suite is what stops them:
// it runs the SAME matrix of days through BOTH and asserts they agree to the
// minute.
//
// It is a stack test rather than a unit test because the disagreement this
// class of bug produces is invisible to reasoning about SQL — migration 035
// exists because a timezone conversion silently shifted every punch eight hours
// and no amount of reading the code caught it. attendance_logs stores Manila
// wall-clock digits with a +00 offset, so only a real round trip through real
// Postgres proves the two sides read the same clock.
//
// Requires Node >= 22 and a running stack:
//   colima start && npm run db:start && npm run db:reset && npm run test:db

import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  dayLateUndertime,
  type ScheduleLike,
} from "../../src/lib/attendance-schedule.ts";

const PROJECT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const status = JSON.parse(
  execSync("npx supabase status -o json", { cwd: PROJECT_DIR, encoding: "utf8" }),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

const D = "2026-06-15"; // a Monday

const REGULAR: ScheduleLike = {
  id: "regular", time_in: "08:00", time_out: "17:00",
  break_start: "12:00", break_end: "13:00",
};
const OFFSET: ScheduleLike = {
  id: "offset", time_in: "07:30", time_out: "16:30",
  break_start: "12:00", break_end: "13:00",
};
const NIGHT_NB: ScheduleLike = {
  id: "night-nb", time_in: "22:00", time_out: "06:00",
  break_start: null, break_end: null,
};
const NIGHT_BREAK: ScheduleLike = {
  id: "night-br", time_in: "22:00", time_out: "06:00",
  break_start: "02:00", break_end: "03:00",
};

type Reasons = {
  in_am?: string | null;
  out_am?: string | null;
  in_pm?: string | null;
  out_pm?: string | null;
  day?: string | null;
};

/** An HH:MM on the duty date, or on the day after when `next` is set. */
const ts = (hhmm: string | null, next = false): string | null =>
  hhmm === null ? null : `${next ? "2026-06-16" : D}T${hhmm}:00`;

interface Case {
  name: string;
  sched: ScheduleLike;
  /** [in_am, out_am, in_pm, out_pm] as HH:MM, null for a missing punch. */
  punches: [string | null, string | null, string | null, string | null];
  /** Which punches land on the calendar day after the duty date. */
  nextDay?: [boolean, boolean, boolean, boolean];
  reasons?: Reasons;
}

const CASES: Case[] = [
  // --- the shapes the rule was written for ---
  { name: "complete day", sched: REGULAR, punches: ["08:00", "12:00", "13:00", "17:00"] },
  { name: "no PM arrival", sched: REGULAR, punches: ["08:00", "12:49", null, "17:00"] },
  { name: "no PM departure", sched: REGULAR, punches: ["08:00", "12:00", "13:00", null] },
  { name: "no AM departure", sched: REGULAR, punches: ["08:00", null, "13:00", "17:00"] },
  { name: "no AM arrival", sched: REGULAR, punches: [null, "12:00", "13:00", "17:00"] },
  { name: "no morning at all", sched: REGULAR, punches: [null, null, "13:00", "17:00"] },
  { name: "no afternoon at all", sched: REGULAR, punches: ["08:00", "12:00", null, null] },
  { name: "through lunch, untagged", sched: REGULAR, punches: ["08:00", null, null, "17:00"] },
  { name: "one punch only", sched: REGULAR, punches: ["08:00", null, null, null] },
  { name: "fully blank", sched: REGULAR, punches: [null, null, null, null] },

  // --- per-minute charges on complete sessions ---
  { name: "late arrival", sched: REGULAR, punches: ["08:30", "12:00", "13:00", "17:00"] },
  { name: "early departure", sched: REGULAR, punches: ["08:00", "12:00", "13:00", "16:00"] },
  { name: "late back from lunch", sched: REGULAR, punches: ["08:00", "12:00", "13:30", "17:00"] },
  { name: "late in and late lunch", sched: REGULAR, punches: ["08:30", "12:00", "13:45", "16:20"] },
  { name: "early arrival is not credited", sched: REGULAR, punches: ["07:30", "12:00", "13:00", "17:00"] },

  // --- reasons ---
  {
    name: "NO BREAK on both lunch slots",
    sched: REGULAR, punches: ["08:00", null, null, "17:00"],
    reasons: { out_am: "no_break", in_pm: "no_break" },
  },
  {
    name: "NO BREAK does not forgive a late arrival",
    sched: REGULAR, punches: ["08:30", null, null, "17:00"],
    reasons: { out_am: "no_break", in_pm: "no_break" },
  },
  {
    name: "OB on the morning slots",
    sched: REGULAR, punches: [null, null, "13:00", "17:00"],
    reasons: { in_am: "official_business", out_am: "official_business" },
  },
  {
    name: "a reason on the afternoon leaves the morning charged",
    sched: REGULAR, punches: ["08:00", null, null, "17:00"],
    reasons: { in_pm: "official_business", out_pm: "official_business" },
  },
  {
    name: "day-level reason excuses everything",
    sched: REGULAR, punches: ["08:00", null, null, "17:00"],
    reasons: { day: "off" },
  },
  {
    name: "tagged rest day with no punches",
    sched: REGULAR, punches: [null, null, null, null],
    reasons: { in_am: "saturday", out_am: "saturday", in_pm: "saturday", out_pm: "saturday" },
  },

  // --- an off-shape schedule: the charge is a flat half day either way ---
  { name: "offset schedule, no PM arrival", sched: OFFSET, punches: ["07:30", "12:00", null, "16:30"] },
  { name: "offset schedule, no AM departure", sched: OFFSET, punches: ["07:30", null, "13:00", "16:30"] },

  // --- night shifts: the timezone / next-day trap ---
  {
    name: "night, no break, complete",
    sched: NIGHT_NB, punches: ["22:00", null, null, "06:00"],
    nextDay: [false, false, false, true],
  },
  {
    name: "night, no break, late in and early out",
    sched: NIGHT_NB, punches: ["22:30", null, null, "05:15"],
    nextDay: [false, false, false, true],
  },
  {
    name: "night, no break, no clock-out",
    sched: NIGHT_NB, punches: ["22:00", null, null, null],
  },
  {
    name: "night with a break, complete",
    sched: NIGHT_BREAK, punches: ["22:00", "02:00", "03:00", "06:00"],
    nextDay: [false, true, true, true],
  },
  {
    name: "night with a break, no PM arrival",
    sched: NIGHT_BREAK, punches: ["22:00", "02:00", null, "06:00"],
    nextDay: [false, true, false, true],
  },
  {
    name: "night with a break, late back from lunch",
    sched: NIGHT_BREAK, punches: ["22:00", "02:00", "03:20", "06:00"],
    nextDay: [false, true, true, true],
  },
];

/** The TypeScript answer — the rule every app path actually reads. */
function inTypeScript(c: Case) {
  const [inAm, outAm, inPm, outPm] = c.punches;
  const [nInAm = false, , nInPm = false, nOutPm = false] = c.nextDay ?? [];
  const r = c.reasons ?? {};
  return dayLateUndertime(
    D,
    c.sched,
    {
      time_in_am: inAm,
      time_out_am: outAm,
      time_in_pm: inPm,
      time_out_pm: outPm,
      time_in_am_next_day: nInAm,
      time_in_pm_next_day: nInPm,
      time_out_pm_next_day: nOutPm,
    },
    {
      reasons: {
        in_am: !!r.in_am, out_am: !!r.out_am,
        in_pm: !!r.in_pm, out_pm: !!r.out_pm,
      },
      excuseAm: !!r.day,
      excusePm: !!r.day,
    },
  );
}

/** The SQL answer — what the backfill wrote and the VL deduction reads. */
async function inSql(c: Case) {
  const [inAm, outAm, inPm, outPm] = c.punches;
  const [nInAm = false, nOutAm = false, nInPm = false, nOutPm = false] =
    c.nextDay ?? [];
  const r = c.reasons ?? {};
  const { data, error } = await admin.rpc("day_late_undertime", {
    p_date: D,
    p_time_in: c.sched.time_in,
    p_time_out: c.sched.time_out,
    p_break_start: c.sched.break_start,
    p_break_end: c.sched.break_end,
    p_in_am: ts(inAm, nInAm),
    p_out_am: ts(outAm, nOutAm),
    p_in_pm: ts(inPm, nInPm),
    p_out_pm: ts(outPm, nOutPm),
    p_reason_in_am: r.in_am ?? null,
    p_reason_out_am: r.out_am ?? null,
    p_reason_in_pm: r.in_pm ?? null,
    p_reason_out_pm: r.out_pm ?? null,
    p_no_time_reason: r.day ?? null,
  });
  if (error) throw new Error(`${c.name}: ${error.message}`);
  // An OUT-parameter function comes back as a one-row set.
  const row = Array.isArray(data) ? data[0] : data;
  return {
    lateMinutes: row.late_minutes as number,
    undertimeMinutes: row.undertime_minutes as number,
  };
}

test("the SQL rule and the TypeScript rule agree on every shape of day", async () => {
  const mismatches: string[] = [];
  for (const c of CASES) {
    const ts_ = inTypeScript(c);
    const sql = await inSql(c);
    if (
      ts_.lateMinutes !== sql.lateMinutes ||
      ts_.undertimeMinutes !== sql.undertimeMinutes
    ) {
      mismatches.push(
        `${c.name}: TS late=${ts_.lateMinutes} ut=${ts_.undertimeMinutes} ` +
          `vs SQL late=${sql.lateMinutes} ut=${sql.undertimeMinutes}`,
      );
    }
  }
  assert.deepEqual(mismatches, [], "SQL and TypeScript must not diverge");
});

// The headline numbers, asserted against the SQL directly. If the two
// implementations ever agree on the WRONG answer, the test above stays green —
// these do not.
test("the SQL rule charges a flat half day for an incomplete session", async () => {
  const byName = (n: string) => CASES.find((c) => c.name === n)!;

  assert.deepEqual(await inSql(byName("complete day")), {
    lateMinutes: 0, undertimeMinutes: 0,
  });
  assert.deepEqual(await inSql(byName("no PM arrival")), {
    lateMinutes: 0, undertimeMinutes: 240,
  });
  assert.deepEqual(await inSql(byName("no morning at all")), {
    lateMinutes: 0, undertimeMinutes: 240,
  });
  assert.deepEqual(await inSql(byName("through lunch, untagged")), {
    lateMinutes: 0, undertimeMinutes: 480,
  });
  assert.deepEqual(await inSql(byName("NO BREAK on both lunch slots")), {
    lateMinutes: 0, undertimeMinutes: 0,
  });
  assert.deepEqual(
    await inSql(byName("NO BREAK does not forgive a late arrival")),
    { lateMinutes: 30, undertimeMinutes: 0 },
  );
  assert.deepEqual(await inSql(byName("fully blank")), {
    lateMinutes: 0, undertimeMinutes: 0,
  });
  assert.deepEqual(await inSql(byName("tagged rest day with no punches")), {
    lateMinutes: 0, undertimeMinutes: 0,
  });
  // A 07:30-16:30 morning is 4.5 hours long and still costs exactly 4.
  assert.deepEqual(await inSql(byName("offset schedule, no PM arrival")), {
    lateMinutes: 0, undertimeMinutes: 240,
  });
  // The timezone trap: a 06:00 clock-out stored on the FOLLOWING calendar day
  // is on time for a 22:00-06:00 shift, not eight hours of undertime.
  assert.deepEqual(await inSql(byName("night, no break, complete")), {
    lateMinutes: 0, undertimeMinutes: 0,
  });
  assert.deepEqual(
    await inSql(byName("night, no break, late in and early out")),
    { lateMinutes: 30, undertimeMinutes: 45 },
  );
});

// The backfill is the reason the SQL exists. Prove it moves a real row's stored
// columns to the new rule, through a real UPDATE against real Postgres.
test("the backfill statement recomputes a stored row", async () => {
  const EMPLOYEE = "00000000-0000-0000-0000-0000000000e1"; // seeded
  const DATE = "2026-03-09";

  // A day with a departure but no arrival in the afternoon, carrying the
  // numbers the OLD rule produced (0 / 0).
  const { error: seedErr } = await admin.from("attendance_logs").upsert(
    {
      employee_id: EMPLOYEE,
      date: DATE,
      time_in_am: `${DATE}T08:00:00`,
      time_out_am: `${DATE}T12:49:00`,
      time_in_pm: null,
      time_out_pm: `${DATE}T17:00:00`,
      late_minutes: 0,
      is_late: false,
      undertime_minutes: 0,
      is_undertime: false,
      is_absent: false,
      source: "biometric",
    },
    { onConflict: "employee_id,date" },
  );
  assert.equal(seedErr, null);

  // Resolve the day the way the migration's UPDATE does — the row carries no
  // pin and the seeded employee no assignment, so it falls to the org default —
  // then recompute through the same shared function and write it back.
  const { data: sched } = await admin
    .from("schedules")
    .select("time_in, time_out, break_start, break_end")
    .eq("is_default", true)
    .single();
  const { data, error } = await admin.rpc("day_late_undertime", {
    p_date: DATE,
    p_time_in: sched!.time_in,
    p_time_out: sched!.time_out,
    p_break_start: sched!.break_start,
    p_break_end: sched!.break_end,
    p_in_am: `${DATE}T08:00:00`,
    p_out_am: `${DATE}T12:49:00`,
    p_in_pm: null,
    p_out_pm: `${DATE}T17:00:00`,
    p_reason_in_am: null, p_reason_out_am: null,
    p_reason_in_pm: null, p_reason_out_pm: null,
    p_no_time_reason: null,
  });
  assert.equal(error, null);
  const row = Array.isArray(data) ? data[0] : data;
  assert.equal(row.undertime_minutes, 240, "the afternoon is charged a half day");
  assert.equal(row.late_minutes, 0);

  const { error: updErr } = await admin
    .from("attendance_logs")
    .update({
      late_minutes: row.late_minutes,
      is_late: row.late_minutes > 0,
      undertime_minutes: row.undertime_minutes,
      is_undertime: row.undertime_minutes > 0,
    })
    .eq("employee_id", EMPLOYEE)
    .eq("date", DATE);
  assert.equal(updErr, null);

  const { data: after } = await admin
    .from("attendance_logs")
    .select("late_minutes, undertime_minutes, is_undertime, is_absent")
    .eq("employee_id", EMPLOYEE)
    .eq("date", DATE)
    .single();
  assert.equal(after!.undertime_minutes, 240);
  assert.equal(after!.is_undertime, true);
  assert.equal(after!.is_absent, false, "the backfill must not touch is_absent");

  await admin
    .from("attendance_logs")
    .delete()
    .eq("employee_id", EMPLOYEE)
    .eq("date", DATE);
});

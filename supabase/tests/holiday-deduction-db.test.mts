// Stack test: the VL auto-deduction honours the holiday calendar (migration 072).
//
// Before 072 the DTR forgave a declared holiday's late/undertime at render time
// and hris.compute_attendance_deduction_minutes deducted it anyway, so the
// printed DTR and the leave credits taken off the employee disagreed. The
// no_am_deductions / no_pm_deductions waivers from 071 would have inherited the
// same split.
//
// This runs ONE shape of day — an hour late in, an hour early out — under every
// holiday type, and asserts the SQL total equals what dayLateUndertime +
// holidayExcusedSessions produce in TypeScript. Same matrix, both sides, to the
// minute: that is the only thing that keeps the two implementations of this
// rule from drifting.
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
import {
  holidayExcusedSessions,
  type HolidayType,
} from "../../src/lib/validations/holiday-schema.ts";

const PROJECT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const status = JSON.parse(
  execSync("npx supabase status -o json", { cwd: PROJECT_DIR, encoding: "utf8" }),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

// Seeded by supabase/seed.sql. Carries no schedule of its own, so every day
// below resolves to the org default — Regular 08:00-17:00 with a 12:00-13:00
// lunch, which is what SCHED mirrors.
const EMPLOYEE = "00000000-0000-0000-0000-0000000000e1";
const SCHED: ScheduleLike = {
  id: "default",
  time_in: "08:00",
  time_out: "17:00",
  break_start: "12:00",
  break_end: "13:00",
};

// A month of its own so nothing else in the suite can contribute minutes.
const YEAR = 2026;
const MONTH = 10;

// In an hour late, out an hour early, both sessions otherwise complete:
// 60 minutes late (AM) + 60 minutes undertime (PM) when nothing is excused.
const PUNCHES = {
  time_in_am: "09:00",
  time_out_am: "12:00",
  time_in_pm: "13:00",
  time_out_pm: "16:00",
};

// One weekday per holiday type, plus a control with no calendar entry.
const DAYS: { date: string; holiday: HolidayType | null }[] = [
  { date: "2026-10-05", holiday: null },
  { date: "2026-10-06", holiday: "no_am_deductions" },
  { date: "2026-10-07", holiday: "no_pm_deductions" },
  { date: "2026-10-08", holiday: "full" },
  { date: "2026-10-09", holiday: "half_am" },
  { date: "2026-10-12", holiday: "half_pm" },
];

/** What the TypeScript side charges for `date` — the DTR's number. */
function expectedMinutes(date: string, holiday: HolidayType | null): number {
  const { am, pm } = holidayExcusedSessions(holiday);
  const { lateMinutes, undertimeMinutes } = dayLateUndertime(
    date,
    SCHED,
    PUNCHES,
    { excuseAm: am, excusePm: pm },
  );
  // The cap compute_attendance_deduction_minutes applies: 8h+ is an absence and
  // is skipped, below that undertime caps at 7h.
  if (undertimeMinutes >= 480) return 0;
  return lateMinutes + Math.min(undertimeMinutes, 420);
}

test.before(async () => {
  await admin.from("attendance_logs").delete().eq("employee_id", EMPLOYEE)
    .gte("date", "2026-10-01").lte("date", "2026-10-31");
  await admin.from("holidays").delete()
    .gte("date", "2026-10-01").lte("date", "2026-10-31");

  await admin.from("attendance_logs").upsert(
    DAYS.map((d) => ({
      employee_id: EMPLOYEE,
      date: d.date,
      time_in_am: `${d.date}T${PUNCHES.time_in_am}:00`,
      time_out_am: `${d.date}T${PUNCHES.time_out_am}:00`,
      time_in_pm: `${d.date}T${PUNCHES.time_in_pm}:00`,
      time_out_pm: `${d.date}T${PUNCHES.time_out_pm}:00`,
      is_absent: false,
      source: "biometric",
    })),
    { onConflict: "employee_id,date" },
  );

  const withHoliday = DAYS.filter((d) => d.holiday !== null);
  const { error } = await admin.from("holidays").insert(
    withHoliday.map((d) => ({
      date: d.date,
      name: `${d.holiday} fixture`,
      type: d.holiday,
    })),
  );
  if (error) throw error;
});

test.after(async () => {
  await admin.from("attendance_logs").delete().eq("employee_id", EMPLOYEE)
    .gte("date", "2026-10-01").lte("date", "2026-10-31");
  await admin.from("holidays").delete()
    .gte("date", "2026-10-01").lte("date", "2026-10-31");
});

test("hris.holidays accepts the two waiver types", async () => {
  const { data, error } = await admin
    .from("holidays")
    .select("date, type")
    .in("date", ["2026-10-06", "2026-10-07"]);
  assert.equal(error, null);
  const byDate = new Map((data ?? []).map((h) => [h.date, h.type]));
  assert.equal(byDate.get("2026-10-06"), "no_am_deductions");
  assert.equal(byDate.get("2026-10-07"), "no_pm_deductions");
});

test("holiday_excuses_am/pm agree with holidayExcusedSessions", async () => {
  for (const type of [
    "full",
    "half_am",
    "half_pm",
    "no_am_deductions",
    "no_pm_deductions",
  ] as HolidayType[]) {
    const [am, pm] = await Promise.all([
      admin.rpc("holiday_excuses_am", { p_type: type }),
      admin.rpc("holiday_excuses_pm", { p_type: type }),
    ]);
    assert.equal(am.error, null);
    assert.equal(pm.error, null);
    assert.deepEqual(
      { am: am.data, pm: pm.data },
      holidayExcusedSessions(type),
      `${type} disagrees between SQL and TypeScript`,
    );
  }
});

test("an unknown or absent type excuses nothing", async () => {
  const [am, pm] = await Promise.all([
    admin.rpc("holiday_excuses_am", { p_type: null }),
    admin.rpc("holiday_excuses_pm", { p_type: null }),
  ]);
  assert.equal(am.data, false);
  assert.equal(pm.data, false);
});

// The 14-argument callers that predate 072 (the migration 070 backfill, the
// existing parity suite) must keep resolving: adding defaulted parameters makes
// an OVERLOAD unless the old signature is dropped, and an unresolved overload
// is an ambiguous-function error, not a silent fallback.
test("day_late_undertime still accepts a 14-argument call", async () => {
  const { data, error } = await admin.rpc("day_late_undertime", {
    p_date: "2026-10-05",
    p_time_in: "08:00", p_time_out: "17:00",
    p_break_start: "12:00", p_break_end: "13:00",
    p_in_am: "2026-10-05T09:00:00", p_out_am: "2026-10-05T12:00:00",
    p_in_pm: "2026-10-05T13:00:00", p_out_pm: "2026-10-05T16:00:00",
    p_reason_in_am: null, p_reason_out_am: null,
    p_reason_in_pm: null, p_reason_out_pm: null,
    p_no_time_reason: null,
  });
  assert.equal(error, null);
  assert.deepEqual(data?.[0] ?? data, {
    late_minutes: 60,
    undertime_minutes: 60,
  });
});

test("each holiday type drops exactly the session it covers", async () => {
  for (const d of DAYS) {
    const { am, pm } = holidayExcusedSessions(d.holiday);
    const { data, error } = await admin.rpc("day_late_undertime", {
      p_date: d.date,
      p_time_in: "08:00", p_time_out: "17:00",
      p_break_start: "12:00", p_break_end: "13:00",
      p_in_am: `${d.date}T09:00:00`, p_out_am: `${d.date}T12:00:00`,
      p_in_pm: `${d.date}T13:00:00`, p_out_pm: `${d.date}T16:00:00`,
      p_excuse_am: am, p_excuse_pm: pm,
    });
    assert.equal(error, null, `${d.holiday}: ${error?.message}`);
    const row = (data?.[0] ?? data) as {
      late_minutes: number;
      undertime_minutes: number;
    };
    assert.deepEqual(
      row,
      { late_minutes: am ? 0 : 60, undertime_minutes: pm ? 0 : 60 },
      `holiday type ${d.holiday} charged the wrong session`,
    );
  }
});

// The whole point: the monthly total the VL ledger is posted from must equal
// the sum of the DTR's per-day numbers.
test("the monthly deduction total matches the DTR's own arithmetic", async () => {
  const { data, error } = await admin.rpc(
    "compute_attendance_deduction_minutes",
    { p_employee_id: EMPLOYEE, p_year: YEAR, p_month: MONTH },
  );
  assert.equal(error, null, error?.message);

  const expected = DAYS.reduce(
    (sum, d) => sum + expectedMinutes(d.date, d.holiday),
    0,
  );
  // 120 control + 60 no_am + 60 no_pm + 0 full + 60 half_am + 60 half_pm.
  assert.equal(expected, 360, "fixture drifted — recheck the day matrix");
  assert.equal(data, expected);
});

// Guards the regression 072 fixes: without the holidays join every day above
// bills the full 120, so the ledger takes more credits than the DTR shows.
test("the total is strictly below the holiday-blind figure", async () => {
  const { data } = await admin.rpc("compute_attendance_deduction_minutes", {
    p_employee_id: EMPLOYEE,
    p_year: YEAR,
    p_month: MONTH,
  });
  assert.equal(DAYS.length * 120, 720);
  assert.ok(
    (data as number) < 720,
    "holidays are being ignored by the deduction sum",
  );
});

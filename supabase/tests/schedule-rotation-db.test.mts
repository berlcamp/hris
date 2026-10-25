// Stack tests for rotations and per-date overrides (migration 094).
//
// The resolver exists twice: in TypeScript (resolveDaySchedule, loaded by
// loadScheduleContext) for the DTR, the importer and the report, and in SQL
// (hris.resolve_day_schedule) for the VL auto-deduction. This suite runs one
// rotating employee through both and asserts they agree day by day, then checks
// the parts only a real database answers: the deduction honouring a rotation's
// rest days, and night-shift punches filed under the right duty day when an
// employee rotates between day and night shifts.
//
// Requires Node >= 22 and a running stack:
//   colima start && npm run db:start && npm run db:reset && npm run test:db

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadScheduleContext } from "../../src/lib/schedule-context.ts";
import { resortDaysForPunches, storePunches } from "../../src/lib/punch-pool.ts";
import { resortEmployeesInRange } from "../../src/lib/schedule-resort.ts";

const PROJECT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const status = JSON.parse(
  execSync("npx supabase status -o json", { cwd: PROJECT_DIR, encoding: "utf8" }),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEPT = "00000000-0000-0000-0000-0000000000d1";
let EMP = "";
let EMP_NO = "";
let DAY_SCHED = "";
let NIGHT_SCHED = "";
let ROTATION = "";

async function one<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as T;
}

before(async () => {
  const day = await one<{ id: string }>(
    admin.from("schedules").insert({
      name: "Rotation test day 7–4", time_in: "07:00", time_out: "16:00",
      break_start: "11:00", break_end: "12:00",
    }).select("id").single(),
  );
  const night = await one<{ id: string }>(
    admin.from("schedules").insert({
      name: "Rotation test night 22–6", time_in: "22:00", time_out: "06:00",
      break_start: null, break_end: null,
    }).select("id").single(),
  );
  DAY_SCHED = day.id;
  NIGHT_SCHED = night.id;

  const emp = await one<{ id: string; biometric_no: number }>(
    admin.from("employees").insert({
      employee_no: "ROT-001", first_name: "Rota", last_name: "Tester",
      employment_type: "plantilla", department_id: DEPT, salary_grade: 11,
      step_increment: 1, hire_date: "2015-01-05", status: "active",
    }).select("id, biometric_no").single(),
  );
  EMP = emp.id;
  EMP_NO = String(emp.biometric_no);

  // Week 1: Mon–Fri day shift, Saturday rostered, Sunday off.
  // Week 2: Mon–Wed night shift, Thu–Sun off.
  const rot = await one<{ id: string }>(
    admin.from("schedule_rotations").insert({ name: "Rotation test A/B", cycle_weeks: 2 })
      .select("id").single(),
  );
  ROTATION = rot.id;
  const days: { rotation_id: string; week_no: number; iso_weekday: number; schedule_id: string | null }[] = [];
  for (let wd = 1; wd <= 7; wd++) {
    days.push({ rotation_id: ROTATION, week_no: 1, iso_weekday: wd, schedule_id: wd <= 6 ? DAY_SCHED : null });
    days.push({ rotation_id: ROTATION, week_no: 2, iso_weekday: wd, schedule_id: wd <= 3 ? NIGHT_SCHED : null });
  }
  await one(admin.from("schedule_rotation_days").insert(days));
  await one(
    admin.from("employee_rotation_assignments").insert({
      employee_id: EMP, rotation_id: ROTATION, effective_from: "2026-10-05", start_week: 1,
    }),
  );
  // One-off: Tuesday 2026-10-20 (a week-1 workday) declared a rest day.
  await one(
    admin.from("schedule_overrides").insert({
      employee_id: EMP, date: "2026-10-20", schedule_id: null, is_rest_day: true,
      note: "rotation test",
    }),
  );
});

after(async () => {
  await admin.from("attendance_punches").delete().eq("employee_id", EMP);
  await admin.from("attendance_logs").delete().eq("employee_id", EMP);
  await admin.from("schedule_overrides").delete().eq("employee_id", EMP);
  await admin.from("employee_rotation_assignments").delete().eq("employee_id", EMP);
  await admin.from("schedule_rotations").delete().eq("id", ROTATION);
  await admin.from("employees").delete().eq("id", EMP);
  await admin.from("schedules").delete().in("id", [DAY_SCHED, NIGHT_SCHED]);
});

function datesBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

test("SQL and TypeScript resolve every day of the rotation the same", async () => {
  const from = "2026-10-01";
  const to = "2026-10-31";
  const resolve = await loadScheduleContext(admin, [EMP], from, to);
  const mismatches: string[] = [];
  for (const date of datesBetween(from, to)) {
    const ts = resolve(EMP, date);
    const { data, error } = await admin.rpc("resolve_day_schedule", {
      p_employee_id: EMP,
      p_date: date,
    });
    assert.equal(error, null, error?.message);
    const sql = Array.isArray(data) ? data[0] : data;
    const sqlTimeIn = (sql.time_in as string).slice(0, 5);
    if (ts.restDay !== sql.is_rest_day || ts.sched.time_in.slice(0, 5) !== sqlTimeIn || ts.source !== sql.source) {
      mismatches.push(
        `${date}: TS ${ts.source}/${ts.sched.time_in}/${ts.restDay} vs SQL ${sql.source}/${sqlTimeIn}/${sql.is_rest_day}`,
      );
    }
  }
  assert.deepEqual(mismatches, []);
});

test("the resolver follows the rotation, its rest days and the override", async () => {
  const resolve = await loadScheduleContext(admin, [EMP], "2026-10-01", "2026-10-31");
  assert.equal(resolve(EMP, "2026-10-02").source, "base", "before the assignment");
  assert.equal(resolve(EMP, "2026-10-07").sched.time_in.slice(0, 5), "07:00");
  assert.equal(resolve(EMP, "2026-10-10").restDay, false, "week-1 Saturday is rostered");
  assert.equal(resolve(EMP, "2026-10-11").restDay, true, "week-1 Sunday is REST");
  assert.equal(resolve(EMP, "2026-10-14").sched.time_in.slice(0, 5), "22:00");
  assert.equal(resolve(EMP, "2026-10-15").restDay, true, "week-2 Thursday is REST");
  assert.equal(resolve(EMP, "2026-10-20").restDay, true, "the override");
  assert.equal(resolve(EMP, "2026-10-20").source, "override");
});

test("the VL deduction charges a rostered Saturday and skips a rotation rest day", async () => {
  // Rostered Saturday 2026-10-10: 30 minutes late, complete day.
  // Week-2 Thursday 2026-10-15 is REST: a late, incomplete day costs nothing.
  const { error } = await admin.from("attendance_logs").insert([
    {
      employee_id: EMP, date: "2026-10-10", source: "biometric",
      time_in_am: "2026-10-10T07:30:00", time_out_am: "2026-10-10T11:00:00",
      time_in_pm: "2026-10-10T12:00:00", time_out_pm: "2026-10-10T16:00:00",
    },
    {
      employee_id: EMP, date: "2026-10-15", source: "biometric",
      time_in_am: "2026-10-15T09:00:00", time_out_am: null,
      time_in_pm: null, time_out_pm: null,
    },
  ]);
  assert.equal(error, null, error?.message);
  const { data, error: rpcErr } = await admin.rpc("compute_attendance_deduction_minutes", {
    p_employee_id: EMP, p_year: 2026, p_month: 10,
  });
  assert.equal(rpcErr, null, rpcErr?.message);
  assert.equal(data, 30);
  await admin.from("attendance_logs").delete().eq("employee_id", EMP).in("date", ["2026-10-10", "2026-10-15"]);
});

test("night-shift punches file under the night they began; day-shift days keep theirs", async () => {
  // Week 2 (Oct 12–14) is nights; week 3 starts Mon Oct 19 on day shift.
  // Wed Oct 14 22:01 → Thu Oct 15 06:02 is Wednesday's night.
  // Mon Oct 19 06:55 is an early arrival for Monday's 07:00 day shift — Sunday
  // Oct 18 is REST, so it must not be pulled back into Sunday.
  const rows = [
    ["2026-10-14", "22:01:00"],
    ["2026-10-15", "06:02:00"],
    ["2026-10-19", "06:55:00"],
    ["2026-10-19", "11:00:00"],
    ["2026-10-19", "12:00:00"],
    ["2026-10-19", "16:01:00"],
  ].map(([date, time]) => ({
    employeeNo: EMP_NO, employeeName: "Rota Tester", employeeId: EMP, date, time, status: "",
  }));
  await storePunches(admin, rows, { deviceId: null, batchId: null });
  await resortDaysForPunches(
    admin,
    rows.map((r) => ({ employeeId: EMP, date: r.date, time: r.time })),
  );

  const { data } = await admin
    .from("attendance_logs")
    .select("date, time_in_am, time_out_pm")
    .eq("employee_id", EMP)
    .order("date");
  const byDate = new Map((data ?? []).map((r) => [r.date, r]));
  assert.ok(byDate.has("2026-10-14"), "Wednesday's night shift");
  assert.equal(byDate.get("2026-10-14")?.time_out_pm?.slice(0, 16), "2026-10-15T06:02");
  assert.equal(byDate.has("2026-10-15"), false, "nothing filed under Thursday");
  assert.equal(byDate.has("2026-10-18"), false, "nothing filed under the REST Sunday");
  assert.equal(byDate.get("2026-10-19")?.time_in_am?.slice(11, 16), "06:55");
  assert.equal(byDate.get("2026-10-19")?.time_out_pm?.slice(11, 16), "16:01");
});

test("a schedule change that moves a punch to the night before clears the stale day", async () => {
  // Mon Oct 26 (week 2 of the cycle → night). Tue Oct 27 06:04 belongs to it.
  // First sort it as if Monday were a day shift (an override), so Tuesday gets
  // its own row; then drop the override and re-sort: Tuesday's row must go.
  const rows = [
    ["2026-10-26", "21:58:00"],
    ["2026-10-27", "06:04:00"],
  ].map(([date, time]) => ({
    employeeNo: EMP_NO, employeeName: "Rota Tester", employeeId: EMP, date, time, status: "",
  }));
  await storePunches(admin, rows, { deviceId: null, batchId: null });
  await one(
    admin.from("schedule_overrides").insert({
      employee_id: EMP, date: "2026-10-26", schedule_id: DAY_SCHED, is_rest_day: false,
    }),
  );
  const seeds = rows.map((r) => ({ employeeId: EMP, date: r.date, time: r.time }));
  await resortDaysForPunches(admin, seeds);
  const before = await one<{ date: string }[]>(
    admin.from("attendance_logs").select("date").eq("employee_id", EMP).in("date", ["2026-10-26", "2026-10-27"]),
  );
  assert.equal(before.length, 2, "with a day shift on Monday, Tuesday has its own row");

  await admin.from("schedule_overrides").delete().eq("employee_id", EMP).eq("date", "2026-10-26");
  await resortDaysForPunches(admin, seeds);
  const after = await one<{ date: string; time_out_pm: string | null }[]>(
    admin.from("attendance_logs").select("date, time_out_pm").eq("employee_id", EMP)
      .in("date", ["2026-10-26", "2026-10-27"]),
  );
  assert.deepEqual(after.map((r) => r.date), ["2026-10-26"]);
  assert.equal(after[0].time_out_pm?.slice(0, 16), "2026-10-27T06:04");
});

test("a range re-sort after an override rebuilds the day from saved punches", async () => {
  // Thu Oct 29 is a week-1 day shift (07:00–16:00). Punches already sorted
  // against it; then the officer marks the day a 22:00 night shift and the
  // 06:01 punch on Fri Oct 30 must move onto Thursday.
  const rows = [
    ["2026-10-29", "21:57:00"],
    ["2026-10-30", "06:01:00"],
  ].map(([date, time]) => ({
    employeeNo: EMP_NO, employeeName: "Rota Tester", employeeId: EMP, date, time, status: "",
  }));
  await storePunches(admin, rows, { deviceId: null, batchId: null });
  await resortEmployeesInRange(admin, [EMP], "2026-10-29", "2026-10-30");

  await one(
    admin.from("schedule_overrides").insert({
      employee_id: EMP, date: "2026-10-29", schedule_id: NIGHT_SCHED, is_rest_day: false,
    }),
  );
  const r = await resortEmployeesInRange(admin, [EMP], "2026-10-29", "2026-10-29");
  assert.ok(r.written >= 1);

  const rowsAfter = await one<{ date: string; time_in_am: string | null; time_out_pm: string | null }[]>(
    admin.from("attendance_logs").select("date, time_in_am, time_out_pm").eq("employee_id", EMP)
      .in("date", ["2026-10-29", "2026-10-30"]).order("date"),
  );
  assert.deepEqual(rowsAfter.map((x) => x.date), ["2026-10-29"]);
  assert.equal(rowsAfter[0].time_in_am?.slice(11, 16), "21:57");
  assert.equal(rowsAfter[0].time_out_pm?.slice(0, 16), "2026-10-30T06:01");
});

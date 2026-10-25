// Stack tests for the raw punch pool (migration 091) against real Postgres +
// PostgREST.
//
// The pool exists so one employee-day can be assembled from SEVERAL devices'
// files — log in at Building 1, log out at Building 3. Only a real database can
// prove the parts that matter:
//   * a day re-sorted after the second device's import carries BOTH devices'
//     punches, in whichever order the files were imported;
//   * the unique key makes a re-upload add nothing;
//   * a day a person authored keeps its row while the punches still land;
//   * the backfill turns saved batches and legacy biometric rows into pool
//     punches, idempotently;
//   * night-shift punches across midnight, from two devices, form one duty day.
//
// Requires Node >= 22 and a running stack:
//   colima start && npm run db:start && npm run db:reset && npm run test:db

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  resortDaysForPunches,
  storePunches,
  type PoolPunchInput,
} from "../../src/lib/punch-pool.ts";

const PROJECT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const status = JSON.parse(
  execSync("npx supabase status -o json", { cwd: PROJECT_DIR, encoding: "utf8" }),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

// Seeded by supabase/seed.sql.
const DEPT = "00000000-0000-0000-0000-0000000000d1";
const NIGHT_SCHED = "00000000-0000-0000-0000-0000000000a2"; // 22:00–06:00

interface Emp {
  id: string;
  no: string;
}
let DAY: Emp; // default 8–5 schedule
let NIGHT: Emp; // night schedule
let DEV_A = "";
let DEV_B = "";

async function makeEmployee(tag: string, scheduleId: string | null): Promise<Emp> {
  const { data, error } = await admin
    .from("employees")
    .insert({
      employee_no: `POOL-${tag}`,
      first_name: "Pool",
      last_name: tag,
      employment_type: "plantilla",
      department_id: DEPT,
      salary_grade: 11,
      step_increment: 1,
      hire_date: "2015-01-05",
      status: "active",
      schedule_id: scheduleId,
    })
    .select("id, biometric_no")
    .single();
  if (error) throw error;
  return { id: data.id, no: String(data.biometric_no) };
}

async function makeDevice(name: string): Promise<string> {
  const { data, error } = await admin
    .from("biometric_devices")
    .insert({ name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function makeBatch(deviceId: string | null, punches: unknown[] = []) {
  const { data, error } = await admin
    .from("attendance_import_batches")
    .insert({
      description: "pool test",
      device_id: deviceId,
      punch_count: punches.length,
      punches,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

const punch = (
  emp: Emp,
  date: string,
  time: string,
  status = "",
): PoolPunchInput => ({
  employeeNo: emp.no,
  employeeName: "Pool Tester",
  employeeId: emp.id,
  date,
  time,
  status,
});

async function dayRow(emp: Emp, date: string) {
  const { data, error } = await admin
    .from("attendance_logs")
    .select("time_in_am, time_out_am, time_in_pm, time_out_pm, source")
    .eq("employee_id", emp.id)
    .eq("date", date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const hhmm = (ts: string | null | undefined) =>
  ts?.match(/(\d{2}:\d{2})/)?.[1] ?? null;
const dateOf = (ts: string | null | undefined) => ts?.slice(0, 10) ?? null;

before(async () => {
  DAY = await makeEmployee("DAY", null);
  NIGHT = await makeEmployee("NIGHT", NIGHT_SCHED);
  DEV_A = await makeDevice("Pool test – Building 1");
  DEV_B = await makeDevice("Pool test – Building 3");
});

after(async () => {
  const ids = [DAY?.id, NIGHT?.id].filter(Boolean);
  await admin.from("attendance_punches").delete().in("employee_id", ids);
  await admin.from("attendance_punches").delete().like("employee_name", "Pool %");
  await admin.from("attendance_logs").delete().in("employee_id", ids);
  await admin.from("attendance_import_batches").delete().eq("description", "pool test");
  await admin.from("biometric_devices").delete().in("id", [DEV_A, DEV_B]);
  await admin.from("employees").delete().in("id", ids);
});

test("a day split across two devices is complete after both imports", async () => {
  const D = "2026-09-07";
  const batchA = await makeBatch(DEV_A);
  await storePunches(admin, [punch(DAY, D, "07:55:12", "check in")], {
    deviceId: DEV_A,
    batchId: batchA,
  });
  await resortDaysForPunches(admin, [{ employeeId: DAY.id, date: D, time: "07:55" }]);

  const batchB = await makeBatch(DEV_B);
  await storePunches(
    admin,
    [
      // Building 3's device has never seen this employee today, so it labels
      // the departure "check in" — the label must not decide the slot.
      punch(DAY, D, "17:02:40", "check in"),
    ],
    { deviceId: DEV_B, batchId: batchB },
  );
  await resortDaysForPunches(admin, [{ employeeId: DAY.id, date: D, time: "17:02" }]);

  const row = await dayRow(DAY, D);
  assert.equal(hhmm(row?.time_in_am), "07:55");
  assert.equal(hhmm(row?.time_out_pm), "17:02");
  assert.equal(row?.source, "biometric");
});

test("import order does not matter", async () => {
  const D = "2026-09-08";
  const batchB = await makeBatch(DEV_B);
  await storePunches(admin, [punch(DAY, D, "17:05:00", "check out")], {
    deviceId: DEV_B,
    batchId: batchB,
  });
  await resortDaysForPunches(admin, [{ employeeId: DAY.id, date: D, time: "17:05" }]);

  const batchA = await makeBatch(DEV_A);
  await storePunches(
    admin,
    [
      punch(DAY, D, "07:58:00", "check in"),
      punch(DAY, D, "12:01:00", "break out"),
      punch(DAY, D, "12:57:00", "break in"),
    ],
    { deviceId: DEV_A, batchId: batchA },
  );
  await resortDaysForPunches(admin, [{ employeeId: DAY.id, date: D, time: "07:58" }]);

  const row = await dayRow(DAY, D);
  assert.deepEqual(
    [row?.time_in_am, row?.time_out_am, row?.time_in_pm, row?.time_out_pm].map(hhmm),
    ["07:58", "12:01", "12:57", "17:05"],
  );
});

test("uploading the same file twice adds no punches", async () => {
  const D = "2026-09-09";
  const rows = [punch(DAY, D, "07:50:01", "check in"), punch(DAY, D, "17:00:09", "check out")];
  const first = await storePunches(admin, rows, {
    deviceId: DEV_A,
    batchId: await makeBatch(DEV_A),
  });
  const second = await storePunches(admin, rows, {
    deviceId: DEV_A,
    batchId: await makeBatch(DEV_A),
  });
  assert.equal(first.inserted, 2);
  assert.equal(second.inserted, 0);
  assert.equal(second.duplicates, 2);

  const { count } = await admin
    .from("attendance_punches")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", DAY.id)
    .eq("punch_date", D);
  assert.equal(count, 2);
});

test("seconds are kept on the stored punch", async () => {
  const D = "2026-09-10";
  await storePunches(admin, [punch(DAY, D, "07:54:37", "check in")], {
    deviceId: DEV_A,
    batchId: await makeBatch(DEV_A),
  });
  const { data } = await admin
    .from("attendance_punches")
    .select("punch_time, device_id")
    .eq("employee_id", DAY.id)
    .eq("punch_date", D)
    .single();
  assert.equal(data?.punch_time, "07:54:37");
  assert.equal(data?.device_id, DEV_A);
});

test("unmatched punches are stored with no employee", async () => {
  const D = "2026-09-10";
  const res = await storePunches(
    admin,
    [
      {
        employeeNo: "99999901",
        employeeName: "Pool Unknown",
        employeeId: null,
        date: D,
        time: "08:00:00",
        status: "check in",
      },
    ],
    { deviceId: DEV_A, batchId: await makeBatch(DEV_A) },
  );
  assert.equal(res.inserted, 1);
  const { data } = await admin
    .from("attendance_punches")
    .select("employee_id")
    .eq("employee_no", "99999901")
    .single();
  assert.equal(data?.employee_id, null);
});

test("a day a person authored keeps its row, but the punch is still stored", async () => {
  const D = "2026-09-11";
  const { error } = await admin.from("attendance_logs").insert({
    employee_id: DAY.id,
    date: D,
    time_in_am: `${D}T08:00:00`,
    time_out_pm: `${D}T17:00:00`,
    source: "manual",
  });
  assert.equal(error, null);

  await storePunches(admin, [punch(DAY, D, "09:30:00", "check in")], {
    deviceId: DEV_A,
    batchId: await makeBatch(DEV_A),
  });
  const res = await resortDaysForPunches(admin, [
    { employeeId: DAY.id, date: D, time: "09:30" },
  ]);
  assert.equal(res.protectedSkipped, 1);
  assert.equal(res.written, 0);

  const row = await dayRow(DAY, D);
  assert.equal(hhmm(row?.time_in_am), "08:00");
  assert.equal(row?.source, "manual");

  const { count } = await admin
    .from("attendance_punches")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", DAY.id)
    .eq("punch_date", D);
  assert.equal(count, 1);
});

test("an approved correction is never re-sorted, even on a biometric row", async () => {
  const D = "2026-09-12";
  const { error } = await admin.from("attendance_logs").insert({
    employee_id: DAY.id,
    date: D,
    time_in_am: `${D}T08:00:00`,
    time_out_pm: `${D}T17:00:00`,
    source: "biometric",
    correction_locked: true,
  });
  assert.equal(error, null);

  await storePunches(admin, [punch(DAY, D, "10:15:00", "check in")], {
    deviceId: DEV_B,
    batchId: await makeBatch(DEV_B),
  });
  const res = await resortDaysForPunches(admin, [
    { employeeId: DAY.id, date: D, time: "10:15" },
  ]);
  assert.equal(res.protectedSkipped, 1);
  assert.equal(hhmm((await dayRow(DAY, D))?.time_in_am), "08:00");
});

test("a dry run counts the days without writing them", async () => {
  const D = "2026-09-21";
  await storePunches(admin, [punch(DAY, D, "07:59:00", "check in")], {
    deviceId: DEV_A,
    batchId: await makeBatch(DEV_A),
  });
  const res = await resortDaysForPunches(
    admin,
    [{ employeeId: DAY.id, date: D, time: "07:59" }],
    { dryRun: true },
  );
  assert.equal(res.written, 1);
  assert.equal(await dayRow(DAY, D), null);
});

test("a night shift across midnight on two devices forms one duty day", async () => {
  const D = "2026-09-14"; // Monday
  await storePunches(admin, [punch(NIGHT, D, "21:56:00", "check in")], {
    deviceId: DEV_A,
    batchId: await makeBatch(DEV_A),
  });
  await storePunches(admin, [punch(NIGHT, "2026-09-15", "06:03:00", "check in")], {
    deviceId: DEV_B,
    batchId: await makeBatch(DEV_B),
  });
  await resortDaysForPunches(admin, [
    { employeeId: NIGHT.id, date: "2026-09-15", time: "06:03" },
  ]);

  const row = await dayRow(NIGHT, D);
  assert.equal(hhmm(row?.time_in_am), "21:56");
  assert.equal(dateOf(row?.time_in_am), D);
  assert.equal(hhmm(row?.time_out_pm), "06:03");
  assert.equal(dateOf(row?.time_out_pm), "2026-09-15");
  // Nothing is filed under the calendar day the 06:03 punch fell on.
  assert.equal(await dayRow(NIGHT, "2026-09-15"), null);
});

test("backfill moves saved batch punches into the pool, once", async () => {
  const D = "2026-09-16";
  const batchId = await makeBatch(DEV_A, [
    { employeeNo: DAY.no, employeeName: "Pool Tester", date: D, time: "07:45", status: "Check In" },
    { employeeNo: DAY.no, employeeName: "Pool Tester", date: D, time: "17:10", status: "Check Out" },
  ]);
  const { data: added, error } = await admin.rpc("backfill_attendance_punches");
  assert.equal(error, null);
  assert.ok((added as number) >= 2);

  const { data } = await admin
    .from("attendance_punches")
    .select("punch_time, device_status, import_batch_id, employee_id, device_id")
    .eq("employee_no", DAY.no)
    .eq("punch_date", D)
    .order("punch_time");
  assert.deepEqual(
    data?.map((p) => [p.punch_time, p.device_status]),
    [
      ["07:45:00", "check in"],
      ["17:10:00", "check out"],
    ],
  );
  assert.ok(data?.every((p) => p.import_batch_id === batchId));
  assert.ok(data?.every((p) => p.employee_id === DAY.id && p.device_id === DEV_A));

  const { data: again } = await admin.rpc("backfill_attendance_punches");
  assert.equal(again, 0);
});

test("a legacy biometric day enters the pool and merges with a later import", async () => {
  const D = "2026-09-17";
  const { error } = await admin.from("attendance_logs").insert({
    employee_id: DAY.id,
    date: D,
    time_in_am: `${D}T07:40:00`,
    time_out_am: `${D}T12:00:00`,
    source: "biometric",
  });
  assert.equal(error, null);
  const { error: rpcErr } = await admin.rpc("backfill_attendance_punches");
  assert.equal(rpcErr, null);

  const { data: legacy } = await admin
    .from("attendance_punches")
    .select("punch_time, source")
    .eq("employee_id", DAY.id)
    .eq("punch_date", D)
    .order("punch_time");
  assert.deepEqual(
    legacy?.map((p) => [p.punch_time, p.source]),
    [
      ["07:40:00", "legacy_log"],
      ["12:00:00", "legacy_log"],
    ],
  );

  // Building 3 later reports the afternoon.
  await storePunches(
    admin,
    [punch(DAY, D, "12:58:00", "check in"), punch(DAY, D, "17:01:00", "check out")],
    { deviceId: DEV_B, batchId: await makeBatch(DEV_B) },
  );
  await resortDaysForPunches(admin, [{ employeeId: DAY.id, date: D, time: "12:58" }]);

  const row = await dayRow(DAY, D);
  assert.deepEqual(
    [row?.time_in_am, row?.time_out_am, row?.time_in_pm, row?.time_out_pm].map(hhmm),
    ["07:40", "12:00", "12:58", "17:01"],
  );
});

test("rematch links pool punches to an employee whose number now matches", async () => {
  const D = "2026-09-18";
  await storePunches(
    admin,
    [{ ...punch(DAY, D, "08:01:00", "check in"), employeeId: null }],
    { deviceId: DEV_A, batchId: await makeBatch(DEV_A) },
  );
  const { error } = await admin.rpc("rematch_attendance_punches");
  assert.equal(error, null);
  const { data } = await admin
    .from("attendance_punches")
    .select("employee_id")
    .eq("employee_no", DAY.no)
    .eq("punch_date", D)
    .single();
  assert.equal(data?.employee_id, DAY.id);
});

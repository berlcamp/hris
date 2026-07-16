// End-to-end test of the biometric-import → attendance_logs → DTR read path
// against the LOCAL Supabase stack (real Postgres + real PostgREST).
//
// The unit suite (dtr-bucketing.test.mts) proves the bucketing MATH. This one
// proves the parts that only a real database can answer:
//
//   * The importer stores HH:MM punches into TIMESTAMPTZ columns by string
//     concatenation (`${date}T${time}:00`, no offset — see toTimestamp in
//     attendance-actions.ts) and the DTR reads them back with a regex
//     (extractTime). That round trip is a claim about Postgres' timezone
//     handling and PostgREST's serialization; SQL-level reasoning cannot
//     confirm it. Migration 035 exists because this bit the project before.
//   * A punch bucketed into time_in_pm must still be in time_in_pm after the
//     round trip — not shifted an hour or a day.
//
// Credentials come from `supabase status -o json` and are never printed.
//
// Requires Node >= 22 (--experimental-strip-types) and a running stack:
//   npx supabase start && npm run test:db

import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  bucketPunchesForDuty,
  type ScheduleLike,
} from "../../src/lib/attendance-schedule.ts";

const PROJECT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const status = JSON.parse(
  execSync("npx supabase status -o json", {
    cwd: PROJECT_DIR,
    encoding: "utf8",
  }),
);

const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

// Seeded by supabase/seed.sql.
const HALFDAY = "00000000-0000-0000-0000-0000000000e1"; // TEST-001
const D = "2026-06-15";

// Mirrors toTimestamp() in src/lib/actions/attendance-actions.ts.
const toTimestamp = (date: string, time: string | null) =>
  time ? `${date}T${time}:00` : null;
// Mirrors extractTime() in src/lib/actions/attendance-actions.ts.
const extractTime = (ts: string | null) => ts?.match(/(\d{2}:\d{2})/)?.[1] ?? null;

const REGULAR: ScheduleLike = {
  id: "regular",
  time_in: "08:00",
  time_out: "17:00",
  break_start: "12:00",
  break_end: "13:00",
};

async function writeDay(bucket: ReturnType<typeof bucketPunchesForDuty>) {
  await admin.from("attendance_logs").delete().eq("employee_id", HALFDAY).eq("date", D);
  const { error } = await admin.from("attendance_logs").insert({
    employee_id: HALFDAY,
    date: D,
    time_in_am: toTimestamp(D, bucket.time_in_am),
    time_out_am: toTimestamp(D, bucket.time_out_am),
    time_in_pm: toTimestamp(D, bucket.time_in_pm),
    time_out_pm: toTimestamp(D, bucket.time_out_pm),
    source: "biometric",
  });
  assert.equal(error, null, `insert failed: ${error?.message}`);

  const { data } = await admin
    .from("attendance_logs")
    .select("time_in_am, time_out_am, time_in_pm, time_out_pm")
    .eq("employee_id", HALFDAY)
    .eq("date", D)
    .single();
  return data;
}

test("the reported case survives the real DB round trip in the PM column", async () => {
  // Absent all morning, first and only punch of the day at 12:45.
  const bucket = bucketPunchesForDuty(
    [{ date: D, time: "12:45", status: "checkin" }],
    D,
    REGULAR,
  );
  const row = await writeDay(bucket);

  assert.equal(extractTime(row.time_in_am), null, "must not print an AM arrival");
  assert.equal(extractTime(row.time_in_pm), "12:45", "must print 12:45 as PM arrival");
});

test("a full day round-trips every slot without a timezone shift", async () => {
  const bucket = bucketPunchesForDuty(
    [
      { date: D, time: "07:54", status: "checkin" },
      { date: D, time: "12:08", status: "breakout" },
      { date: D, time: "12:52", status: "breakin" },
      { date: D, time: "17:05", status: "checkout" },
    ],
    D,
    REGULAR,
  );
  const row = await writeDay(bucket);

  assert.deepEqual(
    {
      in_am: extractTime(row.time_in_am),
      out_am: extractTime(row.time_out_am),
      in_pm: extractTime(row.time_in_pm),
      out_pm: extractTime(row.time_out_pm),
    },
    { in_am: "07:54", out_am: "12:08", in_pm: "12:52", out_pm: "17:05" },
  );
});

test("a 2-punch day stores its departure in time_out_pm", async () => {
  // The phantom-undertime case: no lunch scans at all.
  const bucket = bucketPunchesForDuty(
    [
      { date: D, time: "07:54", status: "checkin" },
      { date: D, time: "17:05", status: "checkout" },
    ],
    D,
    REGULAR,
  );
  const row = await writeDay(bucket);

  assert.equal(extractTime(row.time_in_am), "07:54");
  assert.equal(extractTime(row.time_out_pm), "17:05", "departure must be stored");
  assert.equal(extractTime(row.time_in_pm), null, "17:05 is not a PM arrival");
});

test("re-importing with overwrite CLEARS the stale pre-fix AM arrival", async () => {
  // The correction path for already-imported history depends entirely on this:
  // the upsert must null out time_in_am, not leave the old 12:45 behind next to
  // the new PM arrival. Verifies the real onConflict merge, not a mock.
  await admin.from("attendance_logs").delete().eq("employee_id", HALFDAY).eq("date", D);

  // A row as the PRE-FIX importer would have written it: 12:45 in the AM column,
  // 285 minutes late, 240 minutes of phantom undertime.
  await admin.from("attendance_logs").insert({
    employee_id: HALFDAY,
    date: D,
    time_in_am: toTimestamp(D, "12:45"),
    time_out_pm: null,
    is_late: true,
    late_minutes: 285,
    is_undertime: true,
    undertime_minutes: 240,
    source: "biometric",
  });

  // What the fixed importer now computes from the same raw punch, upserted the
  // way importDahuaAttendance does it with overwriteExisting = true.
  const bucket = bucketPunchesForDuty(
    [{ date: D, time: "12:45", status: "checkin" }],
    D,
    REGULAR,
  );
  const { error } = await admin.from("attendance_logs").upsert(
    {
      employee_id: HALFDAY,
      date: D,
      time_in_am: toTimestamp(D, bucket.time_in_am),
      time_out_am: toTimestamp(D, bucket.time_out_am),
      time_in_pm: toTimestamp(D, bucket.time_in_pm),
      time_out_pm: toTimestamp(D, bucket.time_out_pm),
      is_late: false,
      late_minutes: 0,
      is_undertime: false,
      undertime_minutes: 0,
      source: "biometric",
    },
    { onConflict: "employee_id,date", ignoreDuplicates: false },
  );
  assert.equal(error, null, `upsert failed: ${error?.message}`);

  const { data: row } = await admin
    .from("attendance_logs")
    .select("time_in_am, time_in_pm, late_minutes, undertime_minutes")
    .eq("employee_id", HALFDAY)
    .eq("date", D)
    .single();

  assert.equal(extractTime(row.time_in_am), null, "stale AM arrival must be cleared");
  assert.equal(extractTime(row.time_in_pm), "12:45");
  assert.equal(row.late_minutes, 0, "phantom tardiness must be cleared");
  assert.equal(row.undertime_minutes, 0, "phantom undertime must be cleared");
});

test.after(async () => {
  await admin.from("attendance_logs").delete().eq("employee_id", HALFDAY).eq("date", D);
});

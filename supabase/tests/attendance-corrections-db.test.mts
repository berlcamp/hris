// Stack tests for the correction apply path against real Postgres + PostgREST.
//
// The unit suite proves the record MATH. Only a real database can prove:
//   * apply_attendance_correction is atomic — a drifted row applies NOTHING.
//   * TIMESTAMPTZ round-trips: a 06:05 next-day clock-out written by the
//     builder must read back as 06:05 on the next day, not shifted. Migration
//     035 exists because this bit the project before.
//   * The overlap EXCLUDE constraint actually fires.
//
// Requires Node >= 22 and a running stack:
//   colima start && npm run db:start && npm run db:reset && npm run test:db

import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { buildCorrectionRecord } from "../../src/lib/attendance-corrections.ts";
import type { ScheduleLike } from "../../src/lib/attendance-schedule.ts";

const PROJECT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const status = JSON.parse(
  execSync("npx supabase status -o json", { cwd: PROJECT_DIR, encoding: "utf8" }),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

// Seeded by supabase/seed.sql.
const EMPLOYEE = "00000000-0000-0000-0000-0000000000e1";
const REVIEWER = "00000000-0000-0000-0000-00000000aaaa";
const NIGHT: ScheduleLike = {
  id: "night", time_in: "22:00", time_out: "05:00",
  break_start: null, break_end: null,
};

/** Creates an attendance row for `date` and returns its id. */
async function seedLog(date: string, timeInAm: string) {
  const { data, error } = await admin
    .from("attendance_logs")
    .upsert(
      { employee_id: EMPLOYEE, date, time_in_am: `${date}T${timeInAm}:00`, source: "biometric" },
      { onConflict: "employee_id,date" },
    )
    .select("id, time_in_am, schedule_id, time_out_am, time_in_pm, time_out_pm, source")
    .single();
  if (error) throw error;
  SEEDED_DATES.push(date);
  return data;
}

async function seedRequest(from: string, to: string) {
  const { data, error } = await admin
    .from("attendance_correction_requests")
    .insert({
      employee_id: EMPLOYEE, date_from: from, date_to: to,
      reason: "Night rotation per Office Order 2026-114",
      proof_path: "x/y.pdf", proof_filename: "y.pdf",
      requested_by_email: "dept@example.gov",
    })
    .select("id")
    .single();
  if (error) throw error;
  SEEDED_REQUEST_IDS.push(data.id as string);
  return data.id as string;
}

const beforeOf = (log: Record<string, unknown>) => ({
  time_in_am: log.time_in_am, time_out_am: log.time_out_am,
  time_in_pm: log.time_in_pm, time_out_pm: log.time_out_pm,
  schedule_id: log.schedule_id, source: log.source,
});

// Every duty date and request id this suite seeds, so test.after() can clean
// up precisely — the same pattern dtr-import.test.mts and job-orders.test.mts
// use to stay rerunnable without a `db:reset` between runs. A left-over
// 'pending'/'needs_rebase' request keeps its claim on its date range (the
// acr_no_overlapping_pending EXCLUDE constraint counts both as live), so an
// uncleaned run poisons the next one.
const SEEDED_DATES: string[] = [];
const SEEDED_REQUEST_IDS: string[] = [];

test("applying a correction writes the recomputed row and locks it", async () => {
  const date = "2026-09-07";
  const log = await seedLog(date, "21:55");
  const requestId = await seedRequest(date, date);
  await admin.from("attendance_correction_items").insert({
    request_id: requestId, duty_date: date, attendance_log_id: log.id,
    disposition: "update", before: beforeOf(log),
  });

  const record = buildCorrectionRecord(EMPLOYEE, {
    duty_date: date, disposition: "update", schedule: NIGHT, scheduleId: null,
    time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05",
    reason_in_am: null, reason_out_am: null, reason_in_pm: null, reason_out_pm: null,
  });

  const { data: outcome, error } = await admin.rpc("apply_attendance_correction", {
    p_request_id: requestId,
    p_reviewer_id: REVIEWER,
    p_reviewer_email: "hr@example.gov",
    p_rows: [{ attendance_log_id: log.id, record }],
  });
  assert.equal(error, null);
  assert.equal(outcome, "applied");

  const { data: after } = await admin
    .from("attendance_logs")
    .select("time_in_am, time_out_pm, late_minutes, undertime_minutes, correction_locked, source")
    .eq("id", log.id)
    .single();

  assert.equal(after!.late_minutes, 0);
  assert.equal(after!.undertime_minutes, 0);
  assert.equal(after!.correction_locked, true);
  assert.equal(after!.source, "manual");
  // The TIMESTAMPTZ round trip that migration 035 exists for.
  assert.match(String(after!.time_in_am), /21:55/);
  assert.match(String(after!.time_out_pm), /2026-09-08.*06:05/);

  const { data: req } = await admin
    .from("attendance_correction_requests")
    .select("status, applied_at, reviewed_by_email")
    .eq("id", requestId).single();
  assert.equal(req!.status, "approved");
  assert.ok(req!.applied_at);
});

test("a drifted row applies nothing and returns the request for re-base", async () => {
  const date = "2026-09-14";
  const log = await seedLog(date, "21:55");
  const requestId = await seedRequest(date, date);
  await admin.from("attendance_correction_items").insert({
    request_id: requestId, duty_date: date, attendance_log_id: log.id,
    disposition: "update", before: beforeOf(log),
  });

  // Something else changes the row after the snapshot was taken.
  await admin.from("attendance_logs")
    .update({ time_in_am: `${date}T22:30:00` }).eq("id", log.id);

  const record = buildCorrectionRecord(EMPLOYEE, {
    duty_date: date, disposition: "update", schedule: NIGHT, scheduleId: null,
    time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05",
    reason_in_am: null, reason_out_am: null, reason_in_pm: null, reason_out_pm: null,
  });

  const { data: outcome } = await admin.rpc("apply_attendance_correction", {
    p_request_id: requestId, p_reviewer_id: REVIEWER,
    p_reviewer_email: "hr@example.gov",
    p_rows: [{ attendance_log_id: log.id, record }],
  });
  assert.equal(outcome, "needs_rebase");

  const { data: after } = await admin
    .from("attendance_logs")
    .select("time_in_am, correction_locked").eq("id", log.id).single();
  assert.match(String(after!.time_in_am), /22:30/, "row must be untouched");
  assert.equal(after!.correction_locked, false);

  const { data: req } = await admin
    .from("attendance_correction_requests")
    .select("status").eq("id", requestId).single();
  assert.equal(req!.status, "needs_rebase");
});

test("two live requests cannot claim overlapping dates for one employee", async () => {
  await seedRequest("2026-10-01", "2026-10-10");
  const { error } = await admin
    .from("attendance_correction_requests")
    .insert({
      employee_id: EMPLOYEE, date_from: "2026-10-05", date_to: "2026-10-15",
      reason: "overlapping", proof_path: "a/b.pdf", proof_filename: "b.pdf",
    });
  assert.ok(error, "the EXCLUDE constraint must reject an overlapping live request");
});

// Migration 065 originally declared proposed_time_in_am/out_am/in_pm/out_pm as
// TIMESTAMPTZ, but createCorrectionRequest (attendance-correction-actions.ts)
// writes the zod schema's bare "HH:MM" strings straight through — Postgres
// rejects '21:55'::timestamptz outright. The columns were changed to TIME,
// which accepts wall-clock strings directly; this proves the write path this
// action actually uses (bare HH:MM, no seconds, no date) round-trips cleanly.
test("proposed_time_* columns accept and round-trip bare HH:MM wall-clock values", async () => {
  const date = "2026-09-21";
  const log = await seedLog(date, "21:55");
  const requestId = await seedRequest(date, date);

  const { error: itemError } = await admin
    .from("attendance_correction_items")
    .insert({
      request_id: requestId,
      duty_date: date,
      attendance_log_id: log.id,
      disposition: "update",
      proposed_time_in_am: "21:55",
      proposed_time_out_am: "23:10",
      proposed_time_in_pm: "23:40",
      proposed_time_out_pm: "06:05",
      before: beforeOf(log),
    });
  assert.equal(itemError, null, "HH:MM must insert cleanly into a TIME column");

  const { data: item, error: readError } = await admin
    .from("attendance_correction_items")
    .select(
      "proposed_time_in_am, proposed_time_out_am, proposed_time_in_pm, proposed_time_out_pm",
    )
    .eq("request_id", requestId)
    .single();
  assert.equal(readError, null);
  assert.equal(item!.proposed_time_in_am, "21:55:00");
  assert.equal(item!.proposed_time_out_am, "23:10:00");
  assert.equal(item!.proposed_time_in_pm, "23:40:00");
  // The night-shift clock-out: still 06:05, no date attached — TIME carries
  // no calendar-date rollover, which is the whole point of this column type.
  assert.equal(item!.proposed_time_out_pm, "06:05:00");
});

test("a drifted row in a multi-row batch leaves the OTHER rows untouched too", async () => {
  // A single-row drift test cannot distinguish "atomic multi-row commit" from
  // "single-row drift check". This seeds a 3-day request, drifts only the
  // MIDDLE day after snapshotting, and proves the two days that never drifted
  // are still rolled back with it — the actual point of doing Pass 1 and
  // Pass 2 as two separate loops over the whole batch instead of row-by-row.
  const dates = ["2026-11-01", "2026-11-02", "2026-11-03"];
  const logs = [];
  for (const d of dates) logs.push(await seedLog(d, "21:55"));

  const requestId = await seedRequest(dates[0], dates[dates.length - 1]);
  for (let i = 0; i < dates.length; i++) {
    await admin.from("attendance_correction_items").insert({
      request_id: requestId, duty_date: dates[i], attendance_log_id: logs[i].id,
      disposition: "update", before: beforeOf(logs[i]),
    });
  }

  // Drift only the middle day (index 1) after its snapshot was taken.
  await admin.from("attendance_logs")
    .update({ time_in_am: `${dates[1]}T22:30:00` }).eq("id", logs[1].id);

  const rows = dates.map((d, i) => ({
    attendance_log_id: logs[i].id,
    record: buildCorrectionRecord(EMPLOYEE, {
      duty_date: d, disposition: "update", schedule: NIGHT, scheduleId: null,
      time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05",
      reason_in_am: null, reason_out_am: null, reason_in_pm: null, reason_out_pm: null,
    }),
  }));

  const { data: outcome } = await admin.rpc("apply_attendance_correction", {
    p_request_id: requestId, p_reviewer_id: REVIEWER,
    p_reviewer_email: "hr@example.gov",
    p_rows: rows,
  });
  assert.equal(outcome, "needs_rebase");

  const { data: after } = await admin
    .from("attendance_logs")
    .select("id, time_in_am, correction_locked")
    .in("id", logs.map((l) => l.id));
  const byId = new Map((after ?? []).map((r) => [r.id as string, r]));

  // The two days that never drifted must be untouched too — proof the commit
  // is all-or-nothing across the whole batch, not per row.
  assert.match(String(byId.get(logs[0].id)!.time_in_am), /21:55/, "day 1 (never drifted) must be untouched");
  assert.match(String(byId.get(logs[2].id)!.time_in_am), /21:55/, "day 3 (never drifted) must be untouched");
  assert.match(String(byId.get(logs[1].id)!.time_in_am), /22:30/, "day 2 (drifted) must keep the drifted value");
  for (const l of logs) {
    assert.equal(byId.get(l.id)!.correction_locked, false, `${l.id} must not be locked`);
  }

  const { data: req } = await admin
    .from("attendance_correction_requests")
    .select("status").eq("id", requestId).single();
  assert.equal(req!.status, "needs_rebase");
});

test("an approved correction survives a later biometric overwrite", async () => {
  // A date outside every other live/leftover request range in this file: the
  // "two live requests" test (2026-10-01..15) and the multi-row batch test
  // (2026-11-01..03) both leave a request in a still-"live" status
  // (pending/needs_rebase) for the acr_no_overlapping_pending EXCLUDE
  // constraint until test.after() runs at the very end of the suite.
  const date = "2026-12-02";
  const log = await seedLog(date, "21:55");
  const requestId = await seedRequest(date, date);
  await admin.from("attendance_correction_items").insert({
    request_id: requestId, duty_date: date, attendance_log_id: log.id,
    disposition: "update", before: beforeOf(log),
  });
  const record = buildCorrectionRecord(EMPLOYEE, {
    duty_date: date, disposition: "update", schedule: NIGHT, scheduleId: null,
    time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05",
    reason_in_am: null, reason_out_am: null, reason_in_pm: null, reason_out_pm: null,
  });
  await admin.rpc("apply_attendance_correction", {
    p_request_id: requestId, p_reviewer_id: REVIEWER,
    p_reviewer_email: "hr@example.gov",
    p_rows: [{ attendance_log_id: log.id, record }],
  });

  const { data: locked } = await admin
    .from("attendance_logs")
    .select("correction_locked").eq("id", log.id).single();
  assert.equal(locked!.correction_locked, true,
    "an applied correction must be excluded from later imports");
});

test.after(async () => {
  // Requests first: attendance_correction_items cascade-delete with their
  // parent request (ON DELETE CASCADE, migration 065).
  if (SEEDED_REQUEST_IDS.length > 0) {
    await admin.from("attendance_correction_requests").delete().in("id", SEEDED_REQUEST_IDS);
  }
  if (SEEDED_DATES.length > 0) {
    await admin.from("attendance_logs").delete().eq("employee_id", EMPLOYEE).in("date", SEEDED_DATES);
  }
});

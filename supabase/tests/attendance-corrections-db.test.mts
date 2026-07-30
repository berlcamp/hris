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
  return data.id as string;
}

const beforeOf = (log: Record<string, unknown>) => ({
  time_in_am: log.time_in_am, time_out_am: log.time_out_am,
  time_in_pm: log.time_in_pm, time_out_pm: log.time_out_pm,
  schedule_id: log.schedule_id, source: log.source,
});

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

// Stack tests for the Events module against real Postgres + PostgREST.
//
// Everything here is an invariant the DESIGN rests on, and every one of them is
// a database guarantee that no amount of reasoning about the server actions can
// stand in for:
//
//   * One presence record per person PER DAY — the thing that makes a multi-day
//     event work instead of rejecting day 2 as a duplicate.
//   * client_scan_id replay protection, which is what makes an offline queue
//     safe to retry after a dropped connection.
//   * At most one LIVE QR credential per person, so a reissued card genuinely
//     kills the old one rather than leaving two valid codes in circulation.
//   * The polymorphic attendee key really does span registries with no FK.
//
// Requires Node >= 22 and a running stack:
//   colima start && npm run db:start && npm run db:reset && npm run test:db

import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

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
const EMPLOYEE_2 = "00000000-0000-0000-0000-0000000000e2";

async function scannerProfileId(): Promise<string> {
  const { data, error } = await admin
    .from("user_profiles")
    .select("id")
    .limit(1)
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** A three-day event, so the per-day rule has something to be tested against. */
async function createEvent(title: string) {
  const { data, error } = await admin
    .from("events")
    .insert({
      title,
      start_date: "2026-03-02",
      end_date: "2026-03-04",
      status: "open",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

function token(): string {
  return "H" + crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase();
}

test("a person can be recorded once per DAY, not once per event", async () => {
  const eventId = await createEvent("Multi-day training");
  const scannedBy = await scannerProfileId();

  const row = (date: string, clientScanId: string) => ({
    event_id: eventId,
    attendance_date: date,
    subject_kind: "employee",
    subject_id: EMPLOYEE,
    full_name: "Test, Employee",
    method: "scan",
    scanned_at: `${date}T09:00:00+08:00`,
    client_scan_id: clientScanId,
    scanned_by: scannedBy,
  });

  const day1 = await admin.from("event_attendance").insert(row("2026-03-02", "c1"));
  assert.equal(day1.error, null, "day 1 must record");

  // Day 2 is a different day: this is the case a once-per-event unique index
  // would have wrongly rejected.
  const day2 = await admin.from("event_attendance").insert(row("2026-03-03", "c2"));
  assert.equal(day2.error, null, "day 2 must record for the same person");

  // Same person, same day, different scan id — the door scanned them twice.
  const dup = await admin.from("event_attendance").insert(row("2026-03-02", "c3"));
  assert.equal(dup.error?.code, "23505", "a second scan on the same day must be rejected");

  await admin.from("events").delete().eq("id", eventId);
});

test("a replayed client_scan_id cannot double-record", async () => {
  const eventId = await createEvent("Replay safety");
  const scannedBy = await scannerProfileId();

  const base = {
    event_id: eventId,
    subject_kind: "employee",
    subject_id: EMPLOYEE,
    full_name: "Test, Employee",
    method: "scan",
    scanned_by: scannedBy,
    client_scan_id: "queued-scan-a",
  };

  const first = await admin.from("event_attendance").insert({
    ...base,
    attendance_date: "2026-03-02",
    scanned_at: "2026-03-02T09:00:00+08:00",
  });
  assert.equal(first.error, null);

  // The device resent its queue after a dropped connection. Even aimed at a
  // different day, the same client_scan_id must not produce a second record.
  const replay = await admin.from("event_attendance").insert({
    ...base,
    attendance_date: "2026-03-03",
    scanned_at: "2026-03-03T09:00:00+08:00",
  });
  assert.equal(replay.error?.code, "23505", "a replayed queue entry must be rejected");

  await admin.from("events").delete().eq("id", eventId);
});

test("only one QR credential is live per person, and rotation swaps it", async () => {
  const subject = { subject_kind: "employee", subject_id: EMPLOYEE_2 };
  await admin
    .from("qr_credentials")
    .delete()
    .eq("subject_kind", "employee")
    .eq("subject_id", EMPLOYEE_2);

  const first = token();
  const a = await admin.from("qr_credentials").insert({ ...subject, token: first });
  assert.equal(a.error, null);

  // A second live credential would mean two valid cards for one person — a lost
  // card that keeps working.
  const b = await admin.from("qr_credentials").insert({ ...subject, token: token() });
  assert.equal(b.error?.code, "23505", "a second live credential must be rejected");

  // Rotation: revoke, then mint. The revoked row stays as history.
  const revoked = await admin
    .from("qr_credentials")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: "lost" })
    .eq("token", first);
  assert.equal(revoked.error, null);

  const second = token();
  const c = await admin.from("qr_credentials").insert({ ...subject, token: second });
  assert.equal(c.error, null, "a new credential must mint once the old is revoked");

  const { data: live } = await admin
    .from("qr_credentials")
    .select("token")
    .eq("subject_id", EMPLOYEE_2)
    .is("revoked_at", null);
  assert.deepEqual(
    live?.map((r) => r.token),
    [second],
    "exactly one live credential, and it is the new one",
  );

  await admin
    .from("qr_credentials")
    .delete()
    .eq("subject_kind", "employee")
    .eq("subject_id", EMPLOYEE_2);
});

test("attendance spans registries with no foreign key to constrain it", async () => {
  const eventId = await createEvent("Mixed personnel");
  const scannedBy = await scannerProfileId();

  // A Job Order subject id that exists in no table at all. There is no FK to
  // enforce otherwise — resolution is the server action's job — and this test
  // pins that fact so a well-meaning FK added later fails loudly here rather
  // than silently locking Job Order and COS personnel out of every event.
  const orphanId = crypto.randomUUID();
  const { error } = await admin.from("event_attendance").insert({
    event_id: eventId,
    attendance_date: "2026-03-02",
    subject_kind: "job_order",
    subject_id: orphanId,
    full_name: "Walk-in, Unresolved",
    method: "scan",
    is_walk_in: true,
    scanned_at: "2026-03-02T09:00:00+08:00",
    scanned_by: scannedBy,
  });
  assert.equal(error, null, "a job_order attendee must record without an employees FK");

  await admin.from("events").delete().eq("id", eventId);
});

test("an event cannot end before it starts", async () => {
  const { error } = await admin.from("events").insert({
    title: "Backwards",
    start_date: "2026-03-04",
    end_date: "2026-03-02",
  });
  assert.equal(error?.code, "23514", "chk_events_dates must reject a reversed range");
});

// Unit tests for the super admin's reach over event attendance from the phone:
// `canOverrideEventAttendance` (src/lib/auth-helpers.ts) and `eventDays`
// (src/lib/event-accent.ts).
//
// Both are load-bearing and neither is protected by anything in the database.
//
//   * canOverrideEventAttendance is what separates the door from the amendment.
//     The Attendance Checker records the day they are standing in; a super
//     admin records against a day that has passed, at an event that has been
//     closed, and removes a record that should not have counted. It must NOT
//     widen to hr_admin: an HR Admin keeps every one of those powers on the
//     desktop, where the roster, the CSV and the audit trail are in view.
//
//   * eventDays is the list of dates the app offers and the only dates
//     recordManualAttendance will accept. It is stepped through UTC midnights
//     on purpose — a local-midnight cursor slides a day backwards for anyone
//     west of Greenwich, which would offer an officer in Manila a day the event
//     never ran and drop the day it did.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import { canOverrideEventAttendance } from "../../src/lib/auth-helpers.ts";
import { eventDays } from "../../src/lib/event-accent.ts";

// ── Who may amend ──────────────────────────────────────────────────────

test("super_admin may amend event attendance", () => {
  assert.equal(canOverrideEventAttendance(["super_admin"]), true);
});

test("hr_admin may not — the desktop report is where they amend", () => {
  assert.equal(canOverrideEventAttendance(["hr_admin"]), false);
});

test("the Attendance Checker may not", () => {
  assert.equal(canOverrideEventAttendance(["event_attendance_officer"]), false);
});

test("no roles at all may not", () => {
  assert.equal(canOverrideEventAttendance(null), false);
  assert.equal(canOverrideEventAttendance([]), false);
});

test("holding super_admin alongside another role still grants it", () => {
  assert.equal(
    canOverrideEventAttendance(["event_attendance_officer", "super_admin"]),
    true,
  );
});

// ── The days an amendment may be filed under ───────────────────────────

test("a three-day event lists all three of its days", () => {
  assert.deepEqual(eventDays("2026-03-02", "2026-03-04"), [
    "2026-03-02",
    "2026-03-03",
    "2026-03-04",
  ]);
});

test("a one-day event is one day, not an empty list", () => {
  assert.deepEqual(eventDays("2026-03-02", "2026-03-02"), ["2026-03-02"]);
});

test("a run across a month boundary does not skip or repeat a day", () => {
  assert.deepEqual(eventDays("2026-02-27", "2026-03-02"), [
    "2026-02-27",
    "2026-02-28",
    "2026-03-01",
    "2026-03-02",
  ]);
});

test("a leap day is one of the days", () => {
  assert.deepEqual(eventDays("2028-02-28", "2028-03-01"), [
    "2028-02-28",
    "2028-02-29",
    "2028-03-01",
  ]);
});

// Defensive: an end before the start is already impossible in the database
// (chk_events_dates, migration 081), but a cached event on a phone is whatever
// was cached. Returning the start day beats returning nothing and leaving the
// sheet with no date to file under.
test("an end date before the start falls back to the start day", () => {
  assert.deepEqual(eventDays("2026-03-04", "2026-03-02"), ["2026-03-04"]);
});

// Unit tests for the punch → AM/PM slot bucketing that every DTR surface
// depends on (`src/lib/attendance-schedule.ts`).
//
// This is the function the Dahua importer calls to decide which column a
// biometric punch lands in. Its output is PERSISTED to hris.attendance_logs at
// import time, which is why a mistake here shows up identically on the printed
// DTR, the attendance list, and the reports — they all just read the stored row.
//
// The bug this suite pins down:
//   An employee absent in the morning who first punches at 12:45 (inside the
//   12:00–13:00 lunch window) has that punch recorded as AM ARRIVAL instead of
//   PM ARRIVAL, because the break-window branch assumes any punch during lunch
//   is a lunch DEPARTURE — true only when a morning arrival already exists.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  bucketPunchesForDuty,
  lateMinutesFor,
  undertimeMinutesFor,
  type ScheduleLike,
} from "../../src/lib/attendance-schedule.ts";

// The org default seeded by migration 036.
const REGULAR: ScheduleLike = {
  id: "regular",
  time_in: "08:00",
  time_out: "17:00",
  break_start: "12:00",
  break_end: "13:00",
};

const NO_BREAK: ScheduleLike = {
  id: "nobreak",
  time_in: "08:00",
  time_out: "16:00",
  break_start: null,
  break_end: null,
};

const D = "2026-06-15"; // a Monday

const punch = (time: string, status = "") => ({ date: D, time, status });

const slots = (b: ReturnType<typeof bucketPunchesForDuty>) => ({
  in_am: b.time_in_am,
  out_am: b.time_out_am,
  in_pm: b.time_in_pm,
  out_pm: b.time_out_pm,
});

// ── The reported bug ────────────────────────────────────────────────

test("absent AM, lone 12:45 punch → PM arrival, not AM arrival", () => {
  const b = bucketPunchesForDuty([punch("12:45", "checkin")], D, REGULAR);
  assert.deepEqual(slots(b), {
    in_am: null,
    out_am: null,
    in_pm: "12:45",
    out_pm: null,
  });
});

test("absent AM, 12:45 arrival + 17:02 departure → PM in/out", () => {
  const b = bucketPunchesForDuty(
    [punch("12:45", "checkin"), punch("17:02", "checkout")],
    D,
    REGULAR,
  );
  assert.deepEqual(slots(b), {
    in_am: null,
    out_am: null,
    in_pm: "12:45",
    out_pm: "17:02",
  });
});

test("absent AM day is not charged ~4.75h tardiness", () => {
  const b = bucketPunchesForDuty(
    [punch("12:45", "checkin"), punch("17:02", "checkout")],
    D,
    REGULAR,
  );
  // Late is anchored on time_in_am. A half-day absence must not read as a
  // 285-minute late arrival.
  assert.equal(lateMinutesFor(D, REGULAR, b.time_in_am, false), 0);
  assert.equal(
    undertimeMinutesFor(D, REGULAR, b.time_out_pm, false, !!b.time_in_am),
    0,
  );
});

// ── Regressions: the paths that already worked must keep working ────

test("normal 4-punch day still buckets correctly", () => {
  const b = bucketPunchesForDuty(
    [
      punch("07:54", "checkin"),
      punch("12:08", "breakout"),
      punch("12:52", "breakin"),
      punch("17:05", "checkout"),
    ],
    D,
    REGULAR,
  );
  assert.deepEqual(slots(b), {
    in_am: "07:54",
    out_am: "12:08",
    in_pm: "12:52",
    out_pm: "17:05",
  });
});

test("unlabeled 4-punch day (CSV import) splits on the break window", () => {
  const b = bucketPunchesForDuty(
    [punch("07:54"), punch("12:08"), punch("12:52"), punch("17:05")],
    D,
    REGULAR,
  );
  assert.deepEqual(slots(b), {
    in_am: "07:54",
    out_am: "12:08",
    in_pm: "12:52",
    out_pm: "17:05",
  });
});

test("morning arrival + single lunch punch → lunch is the AM departure", () => {
  // The case the current rule was written for: AM arrival exists, so the
  // 12:08 punch IS the lunch-out. This must not regress.
  const b = bucketPunchesForDuty(
    [punch("07:54", "checkin"), punch("12:08")],
    D,
    REGULAR,
  );
  assert.deepEqual(slots(b), {
    in_am: "07:54",
    out_am: "12:08",
    in_pm: null,
    out_pm: null,
  });
});

test("AM-only worker (left before lunch) keeps AM slots", () => {
  const b = bucketPunchesForDuty(
    [punch("07:58", "checkin"), punch("11:30", "checkout")],
    D,
    REGULAR,
  );
  assert.deepEqual(slots(b), {
    in_am: "07:58",
    out_am: "11:30",
    in_pm: null,
    out_pm: null,
  });
});

test("no-break shift maps to in_am / out_pm", () => {
  const b = bucketPunchesForDuty(
    [punch("07:58"), punch("16:01")],
    D,
    NO_BREAK,
  );
  assert.deepEqual(slots(b), {
    in_am: "07:58",
    out_am: null,
    in_pm: null,
    out_pm: "16:01",
  });
});

test("late morning arrival before lunch is still an AM arrival", () => {
  // 09:30 is late, but it precedes break_start — it must stay AM arrival and
  // still be charged as late. Guards against over-correcting the fix.
  const b = bucketPunchesForDuty(
    [punch("09:30", "checkin"), punch("17:05", "checkout")],
    D,
    REGULAR,
  );
  assert.deepEqual(slots(b), {
    in_am: "09:30",
    out_am: null,
    in_pm: null,
    out_pm: "17:05",
  });
  assert.equal(lateMinutesFor(D, REGULAR, b.time_in_am, false), 90);
});

test("absent AM, three PM punches → first is PM arrival, last is PM out", () => {
  const b = bucketPunchesForDuty(
    [punch("12:45"), punch("13:30"), punch("17:05")],
    D,
    REGULAR,
  );
  assert.equal(b.time_in_am, null);
  assert.equal(b.time_in_pm, "12:45");
  assert.equal(b.time_out_pm, "17:05");
});

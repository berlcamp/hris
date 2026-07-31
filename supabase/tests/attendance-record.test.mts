// Characterisation tests for the attendance_logs record builder extracted from
// attendance-actions.ts. These pin the CURRENT behaviour so the extraction is
// provably behaviour-preserving, and they are the contract the correction
// apply path builds on.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAttendanceRecord,
  computeAttendanceFlags,
} from "../../src/lib/attendance-record.ts";
import type { ScheduleLike } from "../../src/lib/attendance-schedule.ts";

const REGULAR: ScheduleLike = {
  id: "regular",
  time_in: "08:00",
  time_out: "17:00",
  break_start: "12:00",
  break_end: "13:00",
};

const NIGHT: ScheduleLike = {
  id: "night",
  time_in: "22:00",
  time_out: "05:00",
  break_start: null,
  break_end: null,
};

const EMP = "11111111-1111-1111-1111-111111111111";
const D = "2026-06-15"; // a Monday

const noReasons = {
  reason_in_am: null,
  reason_out_am: null,
  reason_in_pm: null,
  reason_out_pm: null,
};

test("an on-time regular day is neither late nor undertime", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: "08:00", time_out_am: "12:00", time_in_pm: "13:00", time_out_pm: "17:00", ...noReasons },
    REGULAR,
  );
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 0);
  assert.equal(r.is_absent, false);
  assert.equal(r.time_in_am, `${D}T08:00:00`);
});

// This is the 8-5-no-lunch case from the spec: the MATH is already right, and
// only the printed DTR's two blank middle cells are misleading.
test("working straight through lunch charges no late and no undertime", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: "08:00", time_out_am: null, time_in_pm: null, time_out_pm: "17:00", ...noReasons },
    REGULAR,
  );
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 0);
});

test("a night shift clock-out rolls to the next calendar day", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05", ...noReasons },
    NIGHT,
  );
  assert.equal(r.time_in_am, `${D}T21:55:00`);
  assert.equal(r.time_out_pm, "2026-06-16T06:05:00");
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 0);
});

test("an AM reason waives tardiness, a PM reason waives undertime", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    {
      time_in_am: "10:30",
      time_out_am: null,
      time_in_pm: null,
      time_out_pm: null,
      reason_in_am: "official_business",
      reason_out_am: null,
      reason_in_pm: null,
      reason_out_pm: "official_business",
    },
    REGULAR,
  );
  assert.equal(r.late_minutes, 0, "AM reason must zero tardiness");
  assert.equal(r.undertime_minutes, 0, "PM reason must zero undertime");
  assert.equal(r.is_absent, false);
});

test("middle-slot reasons change neither tardiness nor undertime", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    {
      time_in_am: "08:00",
      time_out_am: null,
      time_in_pm: null,
      time_out_pm: "17:00",
      reason_in_am: null,
      reason_out_am: "no_break",
      reason_in_pm: "no_break",
      reason_out_pm: null,
    },
    REGULAR,
  );
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 0);
  assert.equal(r.time_out_am_reason, "no_break");
  assert.equal(r.time_in_pm_reason, "no_break");
});

test("a day with no punches and no reason is absent", () => {
  const flags = computeAttendanceFlags(
    { time_in_am: null, time_out_am: null, time_in_pm: null, time_out_pm: null },
    D,
    REGULAR,
  );
  assert.equal(flags.is_absent, true);
});

// The manual-entry grid now carries a reason per slot and an optional schedule
// per date. buildAttendanceRecord is what both the single-entry and the bulk
// paths funnel into (via buildManualEntryRecord), so these pin the behaviour
// the grid depends on.

test("a manual-entry day with reasons but no punches is not an absence", () => {
  const rec = buildAttendanceRecord(
    "emp-1",
    "2026-09-19",
    {
      time_in_am: null, time_out_am: null, time_in_pm: null, time_out_pm: null,
      reason_in_am: "saturday", reason_out_am: "saturday",
      reason_in_pm: "saturday", reason_out_pm: "saturday",
    },
    REGULAR,
  );
  assert.equal(rec.is_absent, false, "a tagged rest day must not count as absent");
  assert.equal(rec.time_in_am_reason, "saturday");
  assert.equal(rec.time_out_pm_reason, "saturday");
  assert.equal(rec.late_minutes, 0);
  assert.equal(rec.undertime_minutes, 0);
});

test("a per-date schedule pin is written and drives that day's late math", () => {
  const inherited = buildAttendanceRecord(
    "emp-1", "2026-09-21",
    { time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05" },
    REGULAR,
  );
  assert.ok(inherited.late_minutes > 0, "21:55 is very late against a day shift");

  const pinned = buildAttendanceRecord(
    "emp-1", "2026-09-21",
    {
      time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05",
      schedule_id: "night",
    },
    NIGHT,
  );
  assert.equal(pinned.schedule_id, "night", "the row records which shift it was measured against");
  assert.equal(pinned.late_minutes, 0);
});

test("a reason on the AM-in slot waives that day's tardiness", () => {
  const rec = buildAttendanceRecord(
    "emp-1", "2026-09-21",
    {
      time_in_am: "10:30", time_out_am: null, time_in_pm: null, time_out_pm: "17:00",
      reason_in_am: "official_business",
    },
    REGULAR,
  );
  assert.equal(rec.late_minutes, 0, "an excused slot is not charged");
  assert.equal(rec.is_late, false);
});

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

// The 8-5-no-lunch case. Each session is missing a cell, but the half day is
// charged once: four hours until the employee settles them (NO BREAK, or the real
// times). The day is never marked absent.
test("working straight through lunch untagged is charged one half day", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: "08:00", time_out_am: null, time_in_pm: null, time_out_pm: "17:00", ...noReasons },
    REGULAR,
  );
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 240);
  assert.equal(r.is_undertime, true);
  assert.equal(r.is_absent, false);
});

test("NO BREAK on the lunch slots explains the missing punches", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    {
      time_in_am: "08:00", time_out_am: null, time_in_pm: null, time_out_pm: "17:00",
      ...noReasons, reason_out_am: "no_break", reason_in_pm: "no_break",
    },
    REGULAR,
  );
  assert.equal(r.undertime_minutes, 0, "an explained gap is not charged");
  assert.equal(r.late_minutes, 0);

  // Explaining the lunch does NOT forgive the morning: the arrival punch is
  // there and it was half an hour late.
  const late = buildAttendanceRecord(
    EMP,
    D,
    {
      time_in_am: "08:30", time_out_am: null, time_in_pm: null, time_out_pm: "17:00",
      ...noReasons, reason_out_am: "no_break", reason_in_pm: "no_break",
    },
    REGULAR,
  );
  assert.equal(late.late_minutes, 30);
  assert.equal(late.undertime_minutes, 0);
});

// Migration 099: a blank in a session is a flat half day until it is settled.
test("a session missing one of its two punches is charged a half day", () => {
  const pmArrivalMissing = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: "08:00", time_out_am: "12:49", time_in_pm: null, time_out_pm: "17:00", ...noReasons },
    REGULAR,
  );
  assert.equal(pmArrivalMissing.undertime_minutes, 240);
  assert.equal(pmArrivalMissing.late_minutes, 0);

  const pmDepartureMissing = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: "08:00", time_out_am: "12:00", time_in_pm: "13:00", time_out_pm: null, ...noReasons },
    REGULAR,
  );
  assert.equal(pmDepartureMissing.undertime_minutes, 240);

  const amDepartureMissing = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: "08:00", time_out_am: null, time_in_pm: "13:00", time_out_pm: "17:00", ...noReasons },
    REGULAR,
  );
  assert.equal(amDepartureMissing.undertime_minutes, 240);

  // No morning at all, a complete afternoon: the same flat half day.
  const morningAbsent = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: null, time_out_am: null, time_in_pm: "13:00", time_out_pm: "17:00", ...noReasons },
    REGULAR,
  );
  assert.equal(morningAbsent.undertime_minutes, 240);
});

// Whatever shape the schedule is, the charge is the same flat half day.
test("a blank costs the same half day on an offset schedule", () => {
  const OFFSET = {
    id: "offset", time_in: "07:30", time_out: "16:30",
    break_start: "12:00", break_end: "13:00",
  };
  const r = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: "07:30", time_out_am: "12:00", time_in_pm: null, time_out_pm: "16:30", ...noReasons },
    OFFSET,
  );
  assert.equal(r.undertime_minutes, 240);
});

// A no-break shift's missing clock-out used to bill the whole shift. It is
// unsettled now, like any other blank.
test("a no-break shift with no clock-out is 4 hours until settled", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: "22:00", time_out_am: null, time_in_pm: null, time_out_pm: null, ...noReasons },
    NIGHT,
  );
  assert.equal(r.undertime_minutes, 240);
  assert.equal(r.late_minutes, 0);
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
  // Scored against a day schedule both sessions have a blank, so this is one flat
  // half day. The un-pinned day is wrong; the pin below is the fix.
  assert.equal(inherited.late_minutes, 0);
  assert.equal(inherited.undertime_minutes, 240);

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

// --- The day-level reason a punchless day states about itself -----------------
//
// The correction form has no day-level field: a whole-day LEAVE arrives as
// `leave` on the four slot dropdowns. Before dayReasonFor the row went in with
// no_time_reason NULL, and the DTR's full-day-holiday branch — which keys off
// exactly that column to know a human said something about THIS employee's day
// — printed HOLIDAY over a day corrected to LEAVE and threw the slot reasons
// away. These pin the derivation so that cannot come back.

test("a punchless day corrected to LEAVE records LEAVE as the day's reason", () => {
  const rec = buildAttendanceRecord(
    EMP,
    D,
    {
      time_in_am: null, time_out_am: null, time_in_pm: null, time_out_pm: null,
      reason_in_am: "leave", reason_out_am: "leave",
      reason_in_pm: "leave", reason_out_pm: "leave",
    },
    REGULAR,
  );
  assert.equal(rec.no_time_reason, "leave");
  assert.equal(rec.is_absent, false, "a stated day is not an absence");
  assert.equal(rec.late_minutes, 0);
  assert.equal(rec.undertime_minutes, 0);
});

test("the day-level reason is the first slot reason given", () => {
  const rec = buildAttendanceRecord(
    EMP,
    D,
    {
      time_in_am: null, time_out_am: null, time_in_pm: null, time_out_pm: null,
      reason_in_am: null, reason_out_am: null,
      reason_in_pm: "travel", reason_out_pm: "travel",
    },
    REGULAR,
  );
  assert.equal(rec.no_time_reason, "travel");
});

test("an explicit day-level reason is not overwritten by the slots", () => {
  // clear_as_off sets no_time_reason itself and means it.
  const rec = buildAttendanceRecord(
    EMP,
    D,
    {
      time_in_am: null, time_out_am: null, time_in_pm: null, time_out_pm: null,
      no_time_reason: "off",
      reason_in_am: "off", reason_out_am: "off",
      reason_in_pm: "off", reason_out_pm: "off",
    },
    REGULAR,
  );
  assert.equal(rec.no_time_reason, "off");
});

test("a day that has punches derives no day-level reason", () => {
  // A slot reason beside real punches explains ONE missing punch. Promoting it
  // to a statement about the whole day would excuse both sessions and blank
  // the times on the DTR.
  const rec = buildAttendanceRecord(
    EMP,
    D,
    {
      time_in_am: "08:00", time_out_am: "12:00",
      time_in_pm: "13:00", time_out_pm: null,
      reason_out_pm: "official_business",
    },
    REGULAR,
  );
  assert.equal(rec.no_time_reason, null);
  assert.equal(rec.time_out_pm_reason, "official_business");
});

test("a punchless day with no reason at all stays an absence", () => {
  const rec = buildAttendanceRecord(
    EMP,
    D,
    {
      time_in_am: null, time_out_am: null, time_in_pm: null, time_out_pm: null,
      ...noReasons,
    },
    REGULAR,
  );
  assert.equal(rec.no_time_reason, null);
  assert.equal(rec.is_absent, true);
});

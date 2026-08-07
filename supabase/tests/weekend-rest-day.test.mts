// The weekend rest-day rule in dayLateUndertime.
//
// The bug these pin: the DTR printed SATURDAY across a weekend row's time
// columns while charging a full 8-hour undertime in the cells beside it, and
// rolled those 480 minutes into the page total and the leave-credit
// conversion. Two things caused it — a blank weekend attendance_logs row
// carries is_absent = true (it only ever meant "no punches"), and a weekend
// with a single stray scan reached 240 + 240 = 480 and was reclassified as an
// absence, which also erased the punch from the printout.
//
// hris.schedules carries hours only, with no day-of-week column, so nothing in
// this system can roster an employee onto a Saturday. The weekend is therefore
// the one span the schedule model can say no hours are owed on — and with no
// hours owed there is no schedule for a punch to be measured against. So a rest
// day is charged NOTHING: no flat half day, no 8-hour absence, and (migration
// 075) no lateness or early departure either. The times still print; only the
// deduction is dropped.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  dayLateUndertime,
  dayOfWeekFor,
  isRestDay,
  type ScheduleLike,
} from "../../src/lib/attendance-schedule.ts";

const REGULAR: ScheduleLike = {
  id: "regular",
  time_in: "08:00",
  time_out: "17:00",
  break_start: "12:00",
  break_end: "13:00",
};

const NO_BREAK: ScheduleLike = {
  id: "no-break",
  time_in: "08:00",
  time_out: "17:00",
  break_start: null,
  break_end: null,
};

const SAT = "2026-08-01";
const SUN = "2026-08-02";
const MON = "2026-08-03";

const slots = (
  inAm: string | null,
  outAm: string | null,
  inPm: string | null,
  outPm: string | null,
) => ({
  time_in_am: inAm,
  time_out_am: outAm,
  time_in_pm: inPm,
  time_out_pm: outPm,
});

// --- the weekday rule is untouched -------------------------------------------

test("a weekday keeps every flat half-day charge", () => {
  assert.equal(
    dayLateUndertime(MON, REGULAR, slots("08:00", "12:00", null, null))
      .undertimeMinutes,
    240,
    "an unaccounted afternoon is still half a day",
  );
  assert.equal(
    dayLateUndertime(MON, REGULAR, slots("08:00", null, null, null))
      .undertimeMinutes,
    480,
    "a lone weekday scan is still a full day, which the DTR reads as absent",
  );
  assert.equal(
    dayLateUndertime(MON, REGULAR, slots("08:30", "12:00", "13:00", "17:00"))
      .lateMinutes,
    30,
  );
});

// A reason explains the missing punch, so the session is not charged the flat
// half day — but the punches that ARE there stay measured. That interaction
// predates the rest-day rule and must survive it.
test("a weekday reason still waives the half day without forgiving lateness", () => {
  const r = dayLateUndertime(MON, REGULAR, slots("08:30", null, "13:00", "17:00"), {
    reasons: { out_am: true },
  });
  assert.equal(r.undertimeMinutes, 0, "the explained morning is not charged");
  assert.equal(r.lateMinutes, 30, "arriving late is still arriving late");
});

// --- the rest-day rule --------------------------------------------------------

test("isRestDay recognises exactly Saturday and Sunday", () => {
  assert.equal(isRestDay(SAT), true);
  assert.equal(isRestDay(SUN), true);
  assert.equal(isRestDay(MON), false);
  assert.equal(dayOfWeekFor(SAT), 6);
  assert.equal(dayOfWeekFor(SUN), 0);
});

test("a blank weekend is charged nothing", () => {
  for (const d of [SAT, SUN]) {
    const r = dayLateUndertime(d, REGULAR, slots(null, null, null, null));
    assert.equal(r.undertimeMinutes, 0, d);
    assert.equal(r.lateMinutes, 0, d);
  }
});

// The reported symptom, at its source: this is the day that reached 480 and so
// printed SATURDAY beside an 8-hour undertime.
test("a lone weekend scan is not eight hours of undertime", () => {
  const r = dayLateUndertime(SAT, REGULAR, slots("08:00", null, null, null));
  assert.equal(r.undertimeMinutes, 0);
  assert.equal(r.lateMinutes, 0);
});

test("a weekend worked only in the morning is not charged the empty afternoon", () => {
  const r = dayLateUndertime(SAT, REGULAR, slots("08:00", "12:00", null, null));
  assert.equal(r.undertimeMinutes, 0, "no hours are owed on a rest day");
});

test("a weekend worked through a missed lunch scan is not charged", () => {
  const r = dayLateUndertime(SAT, REGULAR, slots("08:00", null, "13:00", "17:00"));
  assert.equal(r.undertimeMinutes, 0);
});

// Migration 075: the per-minute charges go too. A complete weekend session used
// to be scored for lateness and early departure exactly as a Tuesday would be,
// which billed employees for weekend work they volunteered for. Nothing on a
// rest day is owed, so nothing on a rest day is short.
test("a complete weekend session is not measured either", () => {
  assert.equal(
    dayLateUndertime(SAT, REGULAR, slots("08:30", "12:00", "13:00", "17:00"))
      .lateMinutes,
    0,
    "arriving late on a day nothing could roster you onto is not late",
  );
  assert.equal(
    dayLateUndertime(SAT, REGULAR, slots("08:00", "12:00", "13:00", "15:00"))
      .undertimeMinutes,
    0,
    "leaving early on an unrequired duty is not a shortfall",
  );
  assert.equal(
    dayLateUndertime(SAT, REGULAR, slots("08:00", "12:00", "13:30", "17:00"))
      .undertimeMinutes,
    0,
    "and neither is a late return from lunch",
  );
  assert.equal(
    dayLateUndertime(SUN, REGULAR, slots("09:45", "12:00", "13:00", "14:00"))
      .undertimeMinutes,
    0,
    "the same holds for a Sunday",
  );
});

test("a fully worked weekend costs nothing", () => {
  const r = dayLateUndertime(SAT, REGULAR, slots("08:00", "12:00", "13:00", "17:00"));
  assert.equal(r.lateMinutes, 0);
  assert.equal(r.undertimeMinutes, 0);
});

// No-break shifts have one session, so "incomplete" means a missing clock-out.
// The weekday charges are the control here — none of them survive the weekend.
test("a no-break weekend shift is charged nothing", () => {
  assert.equal(
    dayLateUndertime(MON, NO_BREAK, slots("08:00", null, null, null))
      .undertimeMinutes,
    540,
    "a weekday no-break shift with no clock-out bills the whole shift",
  );
  assert.equal(
    dayLateUndertime(SAT, NO_BREAK, slots("08:00", null, null, null))
      .undertimeMinutes,
    0,
    "the same day on a rest day bills nothing",
  );
  assert.equal(
    dayLateUndertime(MON, NO_BREAK, slots("08:00", null, null, "15:00"))
      .undertimeMinutes,
    120,
    "a weekday early departure is charged",
  );
  assert.equal(
    dayLateUndertime(SAT, NO_BREAK, slots("08:00", null, null, "15:00"))
      .undertimeMinutes,
    0,
    "the same departure on a rest day is not",
  );
});

// A holiday that lands on a weekend must not resurrect a charge, and the
// existing excuse options must keep working on top of the rest-day rule.
test("holiday excuses compose with the rest-day rule", () => {
  const r = dayLateUndertime(SAT, REGULAR, slots("08:30", "12:00", "13:00", "15:00"), {
    excuseAm: true,
    excusePm: true,
  });
  assert.equal(r.lateMinutes, 0);
  assert.equal(r.undertimeMinutes, 0);
});

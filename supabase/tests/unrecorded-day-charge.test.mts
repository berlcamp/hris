// What a weekday with NO attendance row (and no approved leave) is charged.
//
// The bug this pins: a half-day holiday (half_am / half_pm) on which an employee
// has no attendance row at all printed HOLIDAY on the holiday half, a blank
// other half, and NO undertime — the half the employee still owed went
// uncharged. It must cost a flat half day (4:00), the same charge
// dayLateUndertime puts on any unaccounted session, and not an absence.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  HALF_DAY_UNDERTIME_MINUTES,
  unrecordedDayCharge,
} from "../../src/lib/attendance-schedule.ts";

// 2026-09-28 is a Monday — the Family Day half_pm holiday that surfaced this.
const MONDAY = "2026-09-28";
const SATURDAY = "2026-09-26";

test("a plain weekday with no row is an 8-hour absence", () => {
  assert.deepEqual(unrecordedDayCharge(MONDAY, false), {
    absent: true,
    undertimeMinutes: 480,
  });
});

test("a half-day holiday with no row charges the owed half as undertime", () => {
  assert.deepEqual(unrecordedDayCharge(MONDAY, true), {
    absent: false,
    undertimeMinutes: HALF_DAY_UNDERTIME_MINUTES,
  });
  assert.equal(HALF_DAY_UNDERTIME_MINUTES, 240);
});

test("a weekend with no row charges nothing, half-day holiday or not", () => {
  const none = { absent: false, undertimeMinutes: 0 };
  assert.deepEqual(unrecordedDayCharge(SATURDAY, false), none);
  assert.deepEqual(unrecordedDayCharge(SATURDAY, true), none);
});

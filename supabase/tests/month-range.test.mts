// The monthly DTR module trusts one thing from the browser: a month key. The
// server re-derives the whole range from it and refuses anything malformed, and
// it re-derives the "current or previous month" window the same way — so the
// arithmetic below is the module's entire input contract.
//
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  endOfMonth,
  formatMonthLabel,
  isMonthKey,
  shiftMonths,
  startOfMonth,
  toMonthKey,
} from "../../src/lib/month-range.ts";

test("toMonthKey takes the month an ISO date falls in", () => {
  assert.equal(toMonthKey("2026-08-05"), "2026-08");
  assert.equal(toMonthKey("2026-08-01"), "2026-08");
  assert.equal(toMonthKey("2026-12-31"), "2026-12");
});

test("startOfMonth is always the 1st", () => {
  assert.equal(startOfMonth("2026-08"), "2026-08-01");
  assert.equal(startOfMonth("2026-02"), "2026-02-01");
});

test("endOfMonth gives the real last day, including February", () => {
  assert.equal(endOfMonth("2026-08"), "2026-08-31", "31-day month");
  assert.equal(endOfMonth("2026-04"), "2026-04-30", "30-day month");
  assert.equal(endOfMonth("2026-12"), "2026-12-31", "December");
  assert.equal(endOfMonth("2026-02"), "2026-02-28", "non-leap February");
  assert.equal(endOfMonth("2028-02"), "2028-02-29", "leap February");
  // 2100 is divisible by 4 but not a leap year — the century rule.
  assert.equal(endOfMonth("2100-02"), "2100-02-28", "century non-leap");
  assert.equal(endOfMonth("2000-02"), "2000-02-29", "400-year leap");
});

test("shiftMonths moves whole months in both directions", () => {
  assert.equal(shiftMonths("2026-08", 0), "2026-08");
  assert.equal(shiftMonths("2026-08", -1), "2026-07");
  assert.equal(shiftMonths("2026-08", 1), "2026-09");
});

test("shiftMonths rolls the year over in both directions", () => {
  // The window the department-scoped roles get on the 1st of January: going
  // back one month must land in the PREVIOUS year, not month zero.
  assert.equal(shiftMonths("2026-01", -1), "2025-12");
  assert.equal(shiftMonths("2026-12", 1), "2027-01");
  assert.equal(shiftMonths("2026-01", -13), "2024-12");
  assert.equal(shiftMonths("2026-03", -14), "2025-01");
  assert.equal(shiftMonths("2026-01", -24), "2024-01");
  assert.equal(shiftMonths("2026-11", 26), "2029-01");
});

test("isMonthKey accepts only a well-formed YYYY-MM", () => {
  assert.equal(isMonthKey("2026-08"), true);
  assert.equal(isMonthKey("2026-01"), true);
  assert.equal(isMonthKey("2026-12"), true);
  assert.equal(isMonthKey("2026-13"), false, "impossible month");
  assert.equal(isMonthKey("2026-00"), false, "month zero");
  assert.equal(isMonthKey("2026-8"), false, "unpadded");
  assert.equal(isMonthKey("2026-08-01"), false, "full date");
  assert.equal(isMonthKey(""), false);
  assert.equal(isMonthKey("not-a-month"), false);
});

test("formatMonthLabel names the month", () => {
  assert.equal(formatMonthLabel("2026-01"), "January 2026");
  assert.equal(formatMonthLabel("2026-08"), "August 2026");
  assert.equal(formatMonthLabel("2025-12"), "December 2025");
});

test("the open window is the current month plus the two before it", () => {
  // Mirrors allowedMonths() in src/lib/actions/dtr-actions.ts: newest first, so
  // the client can default to element 0. The January case is the one that
  // matters — a department admin downloading in January must still reach back
  // into the previous YEAR.
  const window = (current: string) =>
    Array.from({ length: 3 }, (_, back) => shiftMonths(current, -back));

  assert.deepEqual(window("2026-08"), ["2026-08", "2026-07", "2026-06"]);
  assert.deepEqual(window("2026-01"), ["2026-01", "2025-12", "2025-11"]);
  assert.deepEqual(window("2026-02"), ["2026-02", "2026-01", "2025-12"]);
  assert.deepEqual(window("2026-03"), ["2026-03", "2026-02", "2026-01"]);
});

test("consecutive months tile without a gap or an overlap", () => {
  // Every DTR range this module produces is [startOfMonth, endOfMonth]. The day
  // after one month's end must be the next month's start, or a download would
  // silently drop or double-count a duty date.
  for (const month of ["2026-01", "2026-02", "2028-02", "2026-04", "2026-12"]) {
    const next = shiftMonths(month, 1);
    const dayAfterEnd = new Date(`${endOfMonth(month)}T00:00:00`);
    dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
    const iso = `${dayAfterEnd.getFullYear()}-${String(dayAfterEnd.getMonth() + 1).padStart(2, "0")}-${String(dayAfterEnd.getDate()).padStart(2, "0")}`;
    assert.equal(iso, startOfMonth(next), month);
  }
});

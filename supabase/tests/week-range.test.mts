// The weekly DTR module trusts one thing from the browser: a week-start date.
// The server re-derives the whole range from it and refuses anything that is
// not a Monday, so the snapping and the validation below are the module's
// entire input contract.
//
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  endOfWeek,
  formatWeekLabel,
  isWeekStart,
  shiftWeeks,
  startOfWeek,
  weekFileLabel,
} from "../../src/lib/week-range.ts";

test("startOfWeek snaps every day of a week to the same Monday", () => {
  // Mon 2026-07-27 .. Sun 2026-08-02
  const week = [
    "2026-07-27",
    "2026-07-28",
    "2026-07-29",
    "2026-07-30",
    "2026-07-31",
    "2026-08-01",
    "2026-08-02",
  ];
  for (const day of week) {
    assert.equal(startOfWeek(day), "2026-07-27", day);
  }
});

test("Sunday belongs to the week that already started, not the next one", () => {
  // The off-by-one that a naive `1 - getDay()` produces: Sunday is day 0, so it
  // would jump FORWARD one day into the following Monday.
  assert.equal(startOfWeek("2026-08-02"), "2026-07-27");
  assert.equal(startOfWeek("2026-08-03"), "2026-08-03");
});

test("endOfWeek is always the Sunday six days on", () => {
  assert.equal(endOfWeek("2026-07-27"), "2026-08-02");
  // Across a month boundary and a year boundary.
  assert.equal(endOfWeek("2026-12-28"), "2027-01-03");
});

test("shiftWeeks moves whole weeks in both directions", () => {
  assert.equal(shiftWeeks("2026-07-27", 1), "2026-08-03");
  assert.equal(shiftWeeks("2026-07-27", -1), "2026-07-20");
  assert.equal(shiftWeeks("2026-07-27", 0), "2026-07-27");
  // Over a DST-style boundary the arithmetic is still whole days, because
  // setDate works in calendar days rather than in milliseconds.
  assert.equal(shiftWeeks("2026-12-28", 1), "2027-01-04");
});

test("isWeekStart accepts only well-formed Mondays", () => {
  assert.equal(isWeekStart("2026-07-27"), true);
  assert.equal(isWeekStart("2026-07-28"), false, "Tuesday");
  assert.equal(isWeekStart("2026-08-02"), false, "Sunday");
  assert.equal(isWeekStart("2026-7-27"), false, "unpadded");
  assert.equal(isWeekStart(""), false);
  assert.equal(isWeekStart("not-a-date"), false);
  assert.equal(isWeekStart("2026-13-01"), false, "impossible month");
});

test("formatWeekLabel collapses whatever the two ends share", () => {
  assert.equal(formatWeekLabel("2026-08-03"), "August 3 – 9, 2026");
  assert.equal(formatWeekLabel("2026-07-27"), "July 27 – August 2, 2026");
  assert.equal(
    formatWeekLabel("2026-12-28"),
    "December 28, 2026 – January 3, 2027",
  );
});

test("weekFileLabel is the sortable form used in PDF filenames", () => {
  assert.equal(weekFileLabel("2026-07-27"), "2026-07-27_to_2026-08-02");
});

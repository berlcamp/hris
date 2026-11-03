// CSC Form 6 "INCLUSIVE DATES": short leaves list every day, grouped by month.
//
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import { formatGroupedLeaveDates } from "../../src/lib/leave-dates-format.ts";

test("groups days by month, months joined with 'and'", () => {
  const dates = [
    "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-06", "2026-07-07",
    "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-13",
    "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30",
  ];
  assert.equal(
    formatGroupedLeaveDates(dates),
    "July 1,2,3,6,7,8,9,10,13 2026 and October 27,28,29,30 2026",
  );
});

test("single month, single day", () => {
  assert.equal(formatGroupedLeaveDates(["2026-03-05"]), "March 5 2026");
});

test("unsorted and duplicate input is normalized", () => {
  assert.equal(
    formatGroupedLeaveDates(["2026-07-03", "2026-07-01", "2026-07-03"]),
    "July 1,3 2026",
  );
});

test("three months use commas before the final 'and'", () => {
  assert.equal(
    formatGroupedLeaveDates(["2026-01-02", "2026-02-03", "2026-03-04"]),
    "January 2 2026, February 3 2026 and March 4 2026",
  );
});

test("same month in different years stays separate", () => {
  assert.equal(
    formatGroupedLeaveDates(["2026-12-31", "2027-01-04"]),
    "December 31 2026 and January 4 2027",
  );
});

// The payroll-month window a Department Admin may file corrections inside.
//
// Pure date arithmetic, so it is tested here rather than against the stack.
// The cases that matter are the boundaries — the 7th vs the 8th, and the year
// rollover — plus the two properties the rule is easy to lose in a rewrite:
// both months are open during the grace week, and today is always the ceiling.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CORRECTION_GRACE_DAYS,
  correctionWindow,
  correctionWindowError,
  describeCorrectionWindow,
  isDateInCorrectionWindow,
} from "../../src/lib/correction-window.ts";

test("inside the month, only that month is open", () => {
  assert.deepEqual(correctionWindow("2026-07-31"), {
    from: "2026-07-01",
    to: "2026-07-31",
  });
  assert.deepEqual(correctionWindow("2026-07-08"), {
    from: "2026-07-01",
    to: "2026-07-08",
  });
});

test("the grace week reaches back into the previous month", () => {
  assert.deepEqual(correctionWindow("2026-08-01"), {
    from: "2026-07-01",
    to: "2026-08-01",
  });
  assert.deepEqual(correctionWindow("2026-08-05"), {
    from: "2026-07-01",
    to: "2026-08-05",
  });
});

test("day 7 is the last day of grace; day 8 closes the previous month", () => {
  assert.equal(CORRECTION_GRACE_DAYS, 7);
  assert.equal(correctionWindow("2026-08-07").from, "2026-07-01");
  assert.equal(correctionWindow("2026-08-08").from, "2026-08-01");
});

test("the window rolls over the year", () => {
  // January 3 is inside the grace week, so December of the PREVIOUS year opens.
  assert.deepEqual(correctionWindow("2027-01-03"), {
    from: "2026-12-01",
    to: "2027-01-03",
  });
  // January 9 is past it.
  assert.deepEqual(correctionWindow("2027-01-09"), {
    from: "2027-01-01",
    to: "2027-01-09",
  });
});

test("the window never extends past today", () => {
  const w = correctionWindow("2026-08-05");
  assert.equal(w.to, "2026-08-05");
  // A day later this month has not happened yet, even though it is in an open
  // month — filing attendance for it would be asserting a fact about the future.
  assert.equal(isDateInCorrectionWindow("2026-08-06", w), false);
  assert.match(
    correctionWindowError("2026-08-06", w) ?? "",
    /has not happened yet/,
  );
});

test("membership covers both open months and rejects what is older", () => {
  const w = correctionWindow("2026-08-05"); // Jul 1 .. Aug 5
  assert.equal(isDateInCorrectionWindow("2026-07-01", w), true);
  assert.equal(isDateInCorrectionWindow("2026-07-31", w), true);
  assert.equal(isDateInCorrectionWindow("2026-08-05", w), true);
  assert.equal(isDateInCorrectionWindow("2026-06-30", w), false);

  assert.equal(correctionWindowError("2026-07-15", w), null);
  assert.match(
    correctionWindowError("2026-06-30", w) ?? "",
    /outside the payroll month/,
  );
});

test("a July correction filed on August 8 is refused", () => {
  // The exact case the rule was written for: the grace week has closed, so
  // July belongs to HR now.
  const w = correctionWindow("2026-08-08");
  assert.equal(isDateInCorrectionWindow("2026-07-20", w), false);
  assert.equal(isDateInCorrectionWindow("2026-08-03", w), true);
});

test("the window describes itself for the filing form", () => {
  assert.equal(
    describeCorrectionWindow(correctionWindow("2026-08-05")),
    "July 1 – August 5, 2026",
  );
  assert.equal(
    describeCorrectionWindow(correctionWindow("2026-08-20")),
    "August 1 – 20, 2026",
  );
  assert.equal(
    describeCorrectionWindow(correctionWindow("2027-01-03")),
    "December 1, 2026 – January 3, 2027",
  );
});

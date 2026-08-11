// The payroll months a Department Admin may file corrections inside.
//
// Pure date arithmetic, so it is tested here rather than against the stack.
// The cases that matter are the boundaries — the 7th vs the 8th, and the year
// rollover — plus the two properties the rule is easy to lose in a rewrite:
// the grace week opens a FOURTH month on top of the usual three, and today is
// always the ceiling.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CORRECTION_GRACE_DAYS,
  CORRECTION_OPEN_MONTHS,
  correctionWindow,
  correctionWindowError,
  describeCorrectionWindow,
  isDateInCorrectionWindow,
} from "../../src/lib/correction-window.ts";

test("three payroll months are open: this one and the two before it", () => {
  assert.equal(CORRECTION_OPEN_MONTHS, 3);
  assert.deepEqual(correctionWindow("2026-07-31"), {
    from: "2026-05-01",
    to: "2026-07-31",
  });
  assert.deepEqual(correctionWindow("2026-07-08"), {
    from: "2026-05-01",
    to: "2026-07-08",
  });
});

test("the grace week reaches back one month further", () => {
  assert.deepEqual(correctionWindow("2026-08-01"), {
    from: "2026-05-01",
    to: "2026-08-01",
  });
  assert.deepEqual(correctionWindow("2026-08-05"), {
    from: "2026-05-01",
    to: "2026-08-05",
  });
});

test("day 7 is the last day of grace; day 8 closes the oldest month", () => {
  assert.equal(CORRECTION_GRACE_DAYS, 7);
  assert.equal(correctionWindow("2026-08-07").from, "2026-05-01");
  assert.equal(correctionWindow("2026-08-08").from, "2026-06-01");
});

test("the window rolls over the year", () => {
  // January 3 is inside the grace week, so the window reaches back to October.
  assert.deepEqual(correctionWindow("2027-01-03"), {
    from: "2026-10-01",
    to: "2027-01-03",
  });
  // January 9 is past it — November of the previous year is the oldest open one.
  assert.deepEqual(correctionWindow("2027-01-09"), {
    from: "2026-11-01",
    to: "2027-01-09",
  });
  // February past the grace week: November closes, December stays.
  assert.deepEqual(correctionWindow("2027-02-10"), {
    from: "2026-12-01",
    to: "2027-02-10",
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

test("membership covers every open month and rejects what is older", () => {
  const w = correctionWindow("2026-08-05"); // May 1 .. Aug 5
  assert.equal(isDateInCorrectionWindow("2026-05-01", w), true);
  assert.equal(isDateInCorrectionWindow("2026-06-30", w), true);
  assert.equal(isDateInCorrectionWindow("2026-07-31", w), true);
  assert.equal(isDateInCorrectionWindow("2026-08-05", w), true);
  assert.equal(isDateInCorrectionWindow("2026-04-30", w), false);

  assert.equal(correctionWindowError("2026-06-15", w), null);
  assert.match(
    correctionWindowError("2026-04-30", w) ?? "",
    /outside the payroll months/,
  );
});

test("a May correction filed on August 8 is refused", () => {
  // The grace week has closed, so May belongs to HR now — but June and July,
  // the other open months, are still the department's to fix.
  const w = correctionWindow("2026-08-08");
  assert.equal(isDateInCorrectionWindow("2026-05-20", w), false);
  assert.equal(isDateInCorrectionWindow("2026-06-20", w), true);
  assert.equal(isDateInCorrectionWindow("2026-07-20", w), true);
  assert.equal(isDateInCorrectionWindow("2026-08-03", w), true);
});

test("the window describes itself for the filing form", () => {
  assert.equal(
    describeCorrectionWindow(correctionWindow("2026-08-05")),
    "May 1 – August 5, 2026",
  );
  assert.equal(
    describeCorrectionWindow(correctionWindow("2026-08-20")),
    "June 1 – August 20, 2026",
  );
  assert.equal(
    describeCorrectionWindow(correctionWindow("2027-01-03")),
    "October 1, 2026 – January 3, 2027",
  );
});

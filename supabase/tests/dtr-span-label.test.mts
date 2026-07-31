// The DTR row either prints four punch times or ONE label spanning them. Which
// label wins is pure branch ordering, and it has regressed twice while buried
// in dtr-form-column.tsx's JSX:
//
//   * every weekend row spanned "SATURDAY", hiding the times of an employee who
//     actually reported for weekend duty;
//   * a day a correction cleared as OFF printed "HOLIDAY" when it happened to
//     fall on a declared holiday.
//
// Both are asserted below.
//
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  dtrSpanFor,
  isWeekendDayName,
  type DtrSpanInput,
} from "../../src/lib/dtr-span-label.ts";

const day = (over: Partial<DtrSpanInput> = {}): DtrSpanInput => ({
  day_of_week: "Monday",
  holiday: null,
  leave_type: null,
  is_absent: false,
  no_time_reason_label: null,
  ...over,
});

const NO_PUNCH = true;
const WORKED = false;

test("a plain worked day prints its times, not a label", () => {
  assert.equal(dtrSpanFor(day(), WORKED), null);
});

// The reported bug: clear_as_off writes no_time_reason 'off', and that must
// beat the holiday classification for the same date.
test("a day cleared as OFF prints OFF even on a declared holiday", () => {
  const span = dtrSpanFor(
    day({ no_time_reason_label: "OFF", holiday: "full" }),
    NO_PUNCH,
  );
  assert.equal(span?.label, "OFF");
  assert.equal(span?.kind, "reason");
});

test("an explicit reason also beats the weekend and absent defaults", () => {
  assert.equal(
    dtrSpanFor(day({ no_time_reason_label: "OFF", day_of_week: "Saturday" }), NO_PUNCH)?.label,
    "OFF",
  );
  assert.equal(
    dtrSpanFor(day({ no_time_reason_label: "LEAVE", is_absent: true }), NO_PUNCH)?.label,
    "LEAVE",
  );
});

test("a holiday nobody worked still prints HOLIDAY", () => {
  const span = dtrSpanFor(day({ holiday: "full" }), NO_PUNCH);
  assert.equal(span?.label, "HOLIDAY");
  assert.equal(span?.kind, "holiday");
});

// The earlier regression: a worked weekend must show its times.
test("a worked weekend prints times; an unworked one prints the day name", () => {
  assert.equal(dtrSpanFor(day({ day_of_week: "Saturday" }), WORKED), null);
  assert.equal(
    dtrSpanFor(day({ day_of_week: "Saturday" }), NO_PUNCH)?.label,
    "SATURDAY",
  );
  assert.equal(
    dtrSpanFor(day({ day_of_week: "Sunday" }), NO_PUNCH)?.label,
    "SUNDAY",
  );
});

// A holiday somebody worked shows the times, not the label.
test("a worked holiday prints times", () => {
  assert.equal(dtrSpanFor(day({ holiday: "full" }), WORKED), null);
});

test("approved leave prints ON LEAVE, and an absence prints ABSENT", () => {
  assert.equal(dtrSpanFor(day({ leave_type: "VL" }), NO_PUNCH)?.label, "ON LEAVE");
  const absent = dtrSpanFor(day({ is_absent: true }), NO_PUNCH);
  assert.equal(absent?.label, "ABSENT");
  assert.equal(absent?.kind, "absent", "drives the red colour in the PDF");
});

// Leave is the one branch not gated on hasNoPunch: a half-day leave where the
// employee worked the other half still reads as leave.
test("leave spans even when the employee punched", () => {
  assert.equal(dtrSpanFor(day({ leave_type: "VL" }), WORKED)?.label, "ON LEAVE");
});

test("isWeekendDayName recognises exactly the two weekend names", () => {
  assert.equal(isWeekendDayName("Saturday"), true);
  assert.equal(isWeekendDayName("Sunday"), true);
  for (const d of ["Monday", "Friday", "saturday", ""]) {
    assert.equal(isWeekendDayName(d), false, d);
  }
});

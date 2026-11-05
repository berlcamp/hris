// The correction grid's slot rules and schedule labels, and what an ABSENT slot
// does once it reaches the attendance row.
//
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_REASON,
  scheduleHoursLabel,
  scheduleOptions,
  setSlotReason,
  settleAbsentPairs,
} from "../../src/lib/correction-draft.ts";
import { buildCorrectionRecord } from "../../src/lib/attendance-corrections.ts";
import { dayReasonFor } from "../../src/lib/attendance-record.ts";
import {
  slotReasonOpts,
  unsettledSlots,
  type ScheduleLike,
} from "../../src/lib/attendance-schedule.ts";

const BLANK = {
  time_in_am: "", time_out_am: "", time_in_pm: "", time_out_pm: "",
  reason_in_am: NO_REASON, reason_out_am: NO_REASON,
  reason_in_pm: NO_REASON, reason_out_pm: NO_REASON,
};
const REGULAR: ScheduleLike = {
  id: "r", time_in: "08:00", time_out: "17:00", break_start: "12:00", break_end: "13:00",
};
const NO_BREAK: ScheduleLike = {
  id: "n", time_in: "08:00", time_out: "17:00", break_start: null, break_end: null,
};
const MONDAY = "2026-06-15";

// --- a slot holds a time or a reason ---

test("choosing a reason empties that slot's time and no other", () => {
  const d = setSlotReason(
    { ...BLANK, time_in_am: "08:00", time_out_am: "12:00" },
    "in_am", "official_business", true,
  );
  assert.equal(d.reason_in_am, "official_business");
  assert.equal(d.time_in_am, "");
  assert.equal(d.time_out_am, "12:00");
  assert.equal(d.reason_out_am, NO_REASON);
});

// --- ABSENT pairs ---

test("ABSENT on AM In fills AM Out, whichever one is picked", () => {
  for (const slot of ["in_am", "out_am"] as const) {
    const d = setSlotReason({ ...BLANK, time_out_am: "12:00", time_in_am: "08:00" }, slot, "absent", true);
    assert.equal(d.reason_in_am, "absent");
    assert.equal(d.reason_out_am, "absent");
    assert.equal(d.time_in_am, "");
    assert.equal(d.time_out_am, "");
    assert.equal(d.reason_in_pm, NO_REASON);
  }
});

test("ABSENT on PM Out fills PM In and leaves the morning alone", () => {
  const d = setSlotReason({ ...BLANK, time_in_am: "08:00" }, "out_pm", "absent", true);
  assert.equal(d.reason_in_pm, "absent");
  assert.equal(d.reason_out_pm, "absent");
  assert.equal(d.time_in_am, "08:00");
});

test("a no-break shift pairs ABSENT across In and Out", () => {
  const d = setSlotReason(BLANK, "in_am", "absent", false);
  assert.equal(d.reason_out_pm, "absent");
  assert.equal(d.reason_out_am, NO_REASON);
  assert.equal(d.reason_in_pm, NO_REASON);
});

test("leaving ABSENT releases its pair", () => {
  const absent = setSlotReason(BLANK, "in_am", "absent", true);
  for (const value of [NO_REASON, "official_business"]) {
    const d = setSlotReason(absent, "out_am", value, true);
    assert.equal(d.reason_out_am, value);
    assert.equal(d.reason_in_am, NO_REASON);
  }
});

test("a reason that is not ABSENT does not touch the pair", () => {
  const d = setSlotReason({ ...BLANK, time_out_am: "12:00" }, "in_am", "no_break", true);
  assert.equal(d.reason_out_am, NO_REASON);
  assert.equal(d.time_out_am, "12:00");
});

test("switching schedules re-pairs ABSENT", () => {
  const noBreakAbsent = setSlotReason(BLANK, "in_am", "absent", false);
  const onBreak = settleAbsentPairs(noBreakAbsent, true);
  for (const r of [onBreak.reason_in_am, onBreak.reason_out_am, onBreak.reason_in_pm, onBreak.reason_out_pm]) {
    assert.equal(r, "absent");
  }
  const worked = { ...setSlotReason(BLANK, "in_am", "absent", true), time_out_pm: "17:00" };
  const onNoBreak = settleAbsentPairs(worked, false);
  assert.equal(onNoBreak.reason_out_pm, "absent");
  assert.equal(onNoBreak.time_out_pm, "");
});

// --- what ABSENT writes ---

function record(reasons: Partial<Record<"in_am" | "out_am" | "in_pm" | "out_pm", "absent" | "official_business">>, times: Partial<Record<"in_am" | "out_am" | "in_pm" | "out_pm", string>> = {}, schedule = REGULAR) {
  return buildCorrectionRecord("emp", {
    duty_date: MONDAY,
    disposition: "update",
    schedule,
    scheduleId: null,
    time_in_am: times.in_am ?? null,
    time_out_am: times.out_am ?? null,
    time_in_pm: times.in_pm ?? null,
    time_out_pm: times.out_pm ?? null,
    reason_in_am: reasons.in_am ?? null,
    reason_out_am: reasons.out_am ?? null,
    reason_in_pm: reasons.in_pm ?? null,
    reason_out_pm: reasons.out_pm ?? null,
  });
}

test("all four slots ABSENT is an ordinary absence, not an excused day", () => {
  const rec = record({ in_am: "absent", out_am: "absent", in_pm: "absent", out_pm: "absent" });
  assert.equal(rec.is_absent, true);
  assert.equal(rec.no_time_reason, null);
  assert.equal(rec.time_in_am_reason, "absent");
  assert.equal(rec.undertime_minutes, 0, "the DTR charges an is_absent row, not this column");
});

test("a no-break shift marked ABSENT is an absence", () => {
  const rec = record({ in_am: "absent", out_pm: "absent" }, {}, NO_BREAK);
  assert.equal(rec.is_absent, true);
  assert.equal(rec.no_time_reason, null);
});

test("ABSENT morning with an afternoon worked charges the half day", () => {
  const rec = record({ in_am: "absent", out_am: "absent" }, { in_pm: "13:00", out_pm: "17:00" });
  assert.equal(rec.is_absent, false);
  assert.equal(rec.undertime_minutes, 240);
  assert.equal(rec.late_minutes, 0);
});

test("ABSENT morning with OB afternoon and no punches still charges the morning", () => {
  const rec = record({
    in_am: "absent", out_am: "absent",
    in_pm: "official_business", out_pm: "official_business",
  });
  assert.equal(rec.is_absent, false);
  assert.equal(rec.no_time_reason, null, "a day-level reason would excuse the absent morning");
  assert.equal(rec.undertime_minutes, 240);
});

test("ABSENT never becomes the day-level reason", () => {
  const blank = { time_in_am: null, time_out_am: null, time_in_pm: null, time_out_pm: null };
  assert.equal(dayReasonFor({ ...blank, reason_in_am: "absent", reason_out_am: "absent" }), null);
  assert.equal(dayReasonFor({ ...blank, reason_in_am: "leave", reason_out_pm: "absent" }), null);
  assert.equal(dayReasonFor({ ...blank, reason_in_am: "leave" }), "leave");
});

test("ABSENT settles its cells: no PENDING CORRECTION on them", () => {
  const slots = {
    time_in_am: null, time_out_am: null, time_in_pm: "13:00", time_out_pm: null,
  };
  const opts = slotReasonOpts({ in_am: "absent", out_am: "absent" });
  assert.deepEqual(unsettledSlots(MONDAY, REGULAR, slots, opts), ["out_pm"]);
});

// --- schedule labels ---

test("schedule labels are the hours in 12-hour time", () => {
  assert.equal(scheduleHoursLabel({ time_in: "08:00", time_out: "17:00" }), "8:00 AM – 5:00 PM");
  assert.equal(scheduleHoursLabel({ time_in: "00:00", time_out: "12:30" }), "12:00 AM – 12:30 PM");
  assert.equal(scheduleHoursLabel({ time_in: "22:00", time_out: "06:00" }), "10:00 PM – 6:00 AM");
});

test("schedules with the same hours and break are offered once, but all resolve", () => {
  const { all, choices } = scheduleOptions([
    { id: "a", time_in: "04:00", time_out: "12:00", break_start: null, break_end: null },
    { id: "b", time_in: "04:00", time_out: "12:00", break_start: null, break_end: null },
  ]);
  assert.deepEqual(choices.map((c) => c.value), ["a"]);
  assert.deepEqual(all.map((c) => c.label), ["4:00 AM – 12:00 PM", "4:00 AM – 12:00 PM"]);
});

test("the same hours with and without a break stay distinct and tagged", () => {
  const { choices } = scheduleOptions([
    { id: "lunch", time_in: "08:00", time_out: "17:00", break_start: "12:00", break_end: "13:00" },
    { id: "straight", time_in: "08:00", time_out: "17:00", break_start: null, break_end: null },
    { id: "alone", time_in: "09:00", time_out: "17:00", break_start: null, break_end: null },
  ]);
  assert.deepEqual(choices.map((c) => c.label), [
    "8:00 AM – 5:00 PM",
    "8:00 AM – 5:00 PM · no break",
    "9:00 AM – 5:00 PM",
  ]);
});

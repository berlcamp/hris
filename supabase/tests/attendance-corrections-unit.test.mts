// Unit tests for the attendance-corrections constants and pure helpers.
//
// The `no_break` reason exists because an 8AM-5PM employee who works straight
// through lunch produces a DTR with two blank middle cells that read as MISSED
// PUNCHES to whoever signs the form. The math is already correct (0 late, 0
// undertime); only the printout is wrong. A reason in those slots states intent.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_TIME_REASONS,
  NO_TIME_REASON_LABELS,
  NO_TIME_REASON_SHORT,
} from "../../src/lib/constants.ts";

test("no_break is an available attendance reason", () => {
  assert.ok(
    (NO_TIME_REASONS as readonly string[]).includes("no_break"),
    "no_break must be in NO_TIME_REASONS",
  );
});

test("no_break prints NO BREAK in full and NB in a slot", () => {
  assert.equal(NO_TIME_REASON_LABELS.no_break, "NO BREAK");
  assert.equal(NO_TIME_REASON_SHORT.no_break, "NB");
});

test("every reason code has both a full and a short label", () => {
  for (const code of NO_TIME_REASONS) {
    assert.ok(NO_TIME_REASON_LABELS[code], `missing full label for ${code}`);
    assert.ok(NO_TIME_REASON_SHORT[code], `missing short label for ${code}`);
  }
});

import {
  canRequestAttendanceCorrection,
  canReviewAttendanceCorrection,
  canFlagCorrectionEligible,
  canAccessAttendance,
} from "../../src/lib/auth-helpers.ts";

test("department admins may request corrections", () => {
  assert.equal(canRequestAttendanceCorrection("department_admin"), true);
  assert.equal(
    canRequestAttendanceCorrection("department_admin_and_department_head"),
    true,
  );
});

test("requesters cannot review their own corrections", () => {
  assert.equal(canReviewAttendanceCorrection("department_admin"), false);
  assert.equal(canReviewAttendanceCorrection("department_head"), false);
});

test("HR admin, super admin and DTR manager review corrections", () => {
  for (const role of ["super_admin", "hr_admin", "dtr_manager"] as const) {
    assert.equal(canReviewAttendanceCorrection(role), true, role);
    assert.equal(canFlagCorrectionEligible(role), true, role);
  }
});

// The whole point of a narrow helper: filing a correction must NOT drag in the
// Dahua importer, bulk DTR generation, or entry deletion.
test("requesting a correction does not grant attendance module access", () => {
  assert.equal(canAccessAttendance("department_admin"), false);
  assert.equal(canAccessAttendance("department_admin_and_department_head"), false);
});

test("null and undefined roles are denied everywhere", () => {
  for (const fn of [
    canRequestAttendanceCorrection,
    canReviewAttendanceCorrection,
    canFlagCorrectionEligible,
  ]) {
    assert.equal(fn(null), false);
    assert.equal(fn(undefined), false);
  }
});

import {
  buildCorrectionRecord,
  resolveCorrectionSchedule,
  resolveItemSchedules,
  trailingDutyDate,
  type CorrectionItemInput,
} from "../../src/lib/attendance-corrections.ts";
import type { ScheduleLike } from "../../src/lib/attendance-schedule.ts";

const REGULAR: ScheduleLike = {
  id: "regular", time_in: "08:00", time_out: "17:00",
  break_start: "12:00", break_end: "13:00",
};
const NIGHT: ScheduleLike = {
  id: "night", time_in: "22:00", time_out: "05:00",
  break_start: null, break_end: null,
};
const EMP2 = "22222222-2222-2222-2222-222222222222";
const DAY = "2026-06-15";

const item = (over: Partial<CorrectionItemInput>): CorrectionItemInput => ({
  duty_date: DAY,
  disposition: "update",
  schedule: REGULAR,
  scheduleId: null,
  time_in_am: null, time_out_am: null, time_in_pm: null, time_out_pm: null,
  reason_in_am: null, reason_out_am: null, reason_in_pm: null, reason_out_pm: null,
  ...over,
});

// The headline case: 835 min late + 240 min undertime under the inherited 8-5
// schedule becomes 0/0 once the night shift is pinned.
test("pinning a night schedule clears a misread night shift", () => {
  const wrong = buildCorrectionRecord(EMP2, item({
    schedule: REGULAR, time_in_am: "21:55",
  }));
  assert.equal(wrong.late_minutes, 835);

  const right = buildCorrectionRecord(EMP2, item({
    schedule: NIGHT, scheduleId: "night", time_in_am: "21:55", time_out_pm: "06:05",
  }));
  assert.equal(right.late_minutes, 0);
  assert.equal(right.undertime_minutes, 0);
  assert.equal(right.schedule_id, "night");
  assert.equal(right.time_out_pm, "2026-06-16T06:05:00");
});

test("clear_as_off empties the day and prints OFF without marking it absent", () => {
  const r = buildCorrectionRecord(EMP2, item({
    disposition: "clear_as_off",
    schedule: NIGHT,
    // Any proposed times are discarded by clear_as_off.
    time_in_am: "21:55", time_out_pm: "06:05",
  }));
  assert.equal(r.time_in_am, null);
  assert.equal(r.time_out_am, null);
  assert.equal(r.time_in_pm, null);
  assert.equal(r.time_out_pm, null);
  assert.equal(r.time_in_am_reason, "off");
  assert.equal(r.time_out_pm_reason, "off");
  assert.equal(r.is_absent, false, "an OFF day is not an absence");
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 0);
});

test("an applied correction is locked against later biometric overwrite", () => {
  const r = buildCorrectionRecord(EMP2, item({ time_in_am: "08:00", time_out_pm: "17:00" }));
  assert.equal(r.correction_locked, true);
  assert.equal(r.source, "manual");
});

test("no_break fills the two middle slots of a straight-duty day", () => {
  const r = buildCorrectionRecord(EMP2, item({
    time_in_am: "08:00", time_out_pm: "17:00",
    reason_out_am: "no_break", reason_in_pm: "no_break",
  }));
  assert.equal(r.time_out_am_reason, "no_break");
  assert.equal(r.time_in_pm_reason, "no_break");
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 0);
});

test("schedule resolution prefers the item pin, then the row pin, then the employee", () => {
  const orgDefault: ScheduleLike = { ...REGULAR, id: "org" };
  const employee: ScheduleLike = { ...REGULAR, id: "emp" };
  const rowPin: ScheduleLike = { ...REGULAR, id: "row" };
  const itemPin: ScheduleLike = { ...NIGHT, id: "item" };

  assert.equal(resolveCorrectionSchedule(itemPin, rowPin, employee, orgDefault).id, "item");
  assert.equal(resolveCorrectionSchedule(null, rowPin, employee, orgDefault).id, "row");
  assert.equal(resolveCorrectionSchedule(null, null, employee, orgDefault).id, "emp");
  assert.equal(resolveCorrectionSchedule(null, null, null, orgDefault).id, "org");
});

// resolveItemSchedules is the shared core approveCorrectionRequest and
// getCorrectionReviewSummary both call (attendance-correction-actions.ts) so
// the minutes HR reviews and the minutes approval writes cannot diverge. This
// reproduces the exact bug that shipped: getCorrectionReviewSummary used to
// hard-code the row pin to null, so a day carrying a row-level schedule
// override (migration 047) but no item-level pin resolved against the
// employee/org schedule in the summary while approval correctly used the row
// pin — two different numbers for the same day. Asserting on the row pin
// here proves the shared function does NOT reproduce that bug: with no item
// pin, a row pin present beats the employee schedule and the org default.
test("resolveItemSchedules: a row-level pin with no item pin resolves the row's schedule, not the employee's", () => {
  const orgDefault: ScheduleLike = { ...REGULAR, id: "org" };
  const employee: ScheduleLike = { ...REGULAR, id: "emp" };
  const rowSchedule: ScheduleLike = { ...NIGHT, id: "row-sched" };

  const items = [
    { attendance_log_id: "log-1", proposed_schedule_id: null },
  ];
  const scheduleById = new Map([["row-sched", rowSchedule]]);
  const rowScheduleIdByLogId = new Map([["log-1", "row-sched"]]);

  const [resolved] = resolveItemSchedules(
    items,
    scheduleById,
    rowScheduleIdByLogId,
    employee,
    orgDefault,
  );
  assert.equal(resolved.schedule.id, "row-sched");
  assert.equal(resolved.itemPinMissing, false);

  // Same call, item pin present this time — it must still win over the row
  // pin, matching resolveCorrectionSchedule's precedence.
  const itemSchedule: ScheduleLike = { ...NIGHT, id: "item-sched" };
  const [withItemPin] = resolveItemSchedules(
    [{ attendance_log_id: "log-1", proposed_schedule_id: "item-sched" }],
    new Map([["row-sched", rowSchedule], ["item-sched", itemSchedule]]),
    rowScheduleIdByLogId,
    employee,
    orgDefault,
  );
  assert.equal(withItemPin.schedule.id, "item-sched");
  assert.equal(withItemPin.itemPinMissing, false);
});

test("resolveItemSchedules: an item pin id that resolves to no schedule is flagged, not silently dropped", () => {
  const items = [{ attendance_log_id: "log-1", proposed_schedule_id: "deleted-sched" }];
  const [resolved] = resolveItemSchedules(
    items,
    new Map(), // the pinned schedule id is not in scheduleById — "deleted"
    new Map([["log-1", null]]),
    null,
    { ...REGULAR, id: "org" },
  );
  assert.equal(resolved.itemPinMissing, true);
});

// A night-shift range consumes the following morning, so an N-day range touches
// N+1 rows. A day-shift range does not.
test("a night-shift range reaches one day past its end", () => {
  assert.equal(trailingDutyDate("2026-06-20", NIGHT), "2026-06-21");
  assert.equal(trailingDutyDate("2026-06-20", REGULAR), null);
});

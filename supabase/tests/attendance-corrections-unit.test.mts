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
  CORRECTION_REASONS,
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
  canAccessAttendance,
  canDirectApplyAttendanceCorrection,
  canFileAttendanceCorrection,
  canOpenAttendanceCorrections,
  canReadOwnDeptCorrections,
} from "../../src/lib/auth-helpers.ts";
import type { UserRole } from "../../src/lib/types.ts";

// The corrections helpers take the whole user, because a Department Admin's
// access is also settable per account (migration 076) and because an account
// holds a SET of roles (migration 087). Most cases here only care about the
// role, so they use the account whose switch is ON — the default every user
// profile is created with.
const on = (role: UserRole | null | undefined) => ({
  roles: role ? [role] : role,
  canAccessAttendanceCorrections: true,
});

test("department admins may request corrections", () => {
  assert.equal(canRequestAttendanceCorrection(on("department_admin")), true);
  assert.equal(
    canRequestAttendanceCorrection(on("department_admin_and_department_head")),
    true,
  );
});

// The per-account switch. It takes access away from the dept-admin roles and
// is not read for anyone else — a reviewer's access comes from the role.
test("the corrections switch closes the module for a department admin", () => {
  for (const role of [
    "department_admin",
    "department_admin_and_department_head",
  ] as const) {
    const off = { roles: [role], canAccessAttendanceCorrections: false };
    assert.equal(canRequestAttendanceCorrection(off), false, role);
    assert.equal(canFileAttendanceCorrection(off), false, role);
    assert.equal(canOpenAttendanceCorrections(off), false, role);
    assert.equal(canReadOwnDeptCorrections(off), false, role);
  }
});

test("the corrections switch is ignored for every other role", () => {
  for (const role of ["super_admin", "hr_admin", "dtr_manager", "ocm_admin"] as const) {
    const off = { roles: [role], canAccessAttendanceCorrections: false };
    assert.equal(canFileAttendanceCorrection(off), true, role);
    assert.equal(canOpenAttendanceCorrections(off), true, role);
  }
  // Read-only viewer: keeps its own department's queue whatever the flag says.
  assert.equal(
    canOpenAttendanceCorrections({
      roles: ["department_head"],
      canAccessAttendanceCorrections: false,
    }),
    true,
  );
});

// A user object from before the column existed, or any partial shape, must
// keep the access its role grants rather than silently losing it.
test("a missing switch value reads as ON", () => {
  assert.equal(
    canRequestAttendanceCorrection({ roles: ["department_admin"] }),
    true,
  );
  assert.equal(
    canRequestAttendanceCorrection({
      roles: ["department_admin"],
      canAccessAttendanceCorrections: null,
    }),
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
  }
});

// The whole point of a narrow helper: filing a correction must NOT drag in the
// Dahua importer, bulk DTR generation, or entry deletion.
test("requesting a correction does not grant attendance module access", () => {
  assert.equal(canAccessAttendance("department_admin"), false);
  assert.equal(canAccessAttendance("department_admin_and_department_head"), false);
});

test("null and undefined roles are denied everywhere", () => {
  for (const role of [null, undefined] as const) {
    assert.equal(canRequestAttendanceCorrection(on(role)), false);
    assert.equal(canReviewAttendanceCorrection(role), false);
    assert.equal(canDirectApplyAttendanceCorrection(role), false);
  }
});


// ── Multiple roles per account (migration 087) ─────────────────────────

// The requester and reviewer sets must stay disjoint: nothing a requester files
// may reach a DTR without a second party approving it. An account can now hold
// a role from each side, so the helper resolves it rather than trusting the
// configuration — the reviewer wins, and loses nothing, because direct-apply
// already records the same correction outright.
test("an account holding both sides reviews rather than requests", () => {
  const both = {
    roles: ["hr_admin", "department_admin"] as UserRole[],
    canAccessAttendanceCorrections: true,
  };
  assert.equal(canRequestAttendanceCorrection(both), false);
  assert.equal(canReviewAttendanceCorrection(both.roles), true);
  assert.equal(canDirectApplyAttendanceCorrection(both.roles), true);
  assert.equal(canFileAttendanceCorrection(both), true);
  assert.equal(canOpenAttendanceCorrections(both), true);
});

// A grant is the union over the account's roles: a second role only ever adds.
test("a second role adds reach and never removes it", () => {
  const deptAdminAndJo = {
    roles: ["department_admin", "jo_manager"] as UserRole[],
    canAccessAttendanceCorrections: true,
  };
  assert.equal(canRequestAttendanceCorrection(deptAdminAndJo), true);
  assert.equal(canOpenAttendanceCorrections(deptAdminAndJo), true);

  // ...and the module gate the dept-admin role does NOT open stays shut.
  assert.equal(canAccessAttendance(deptAdminAndJo.roles), false);
});

// The switch qualifies the dept-admin GRANT, so an account that reaches the
// module by another role is unaffected by it.
test("the corrections switch does not reach a role it was never about", () => {
  const off = {
    roles: ["department_admin", "dtr_manager"] as UserRole[],
    canAccessAttendanceCorrections: false,
  };
  assert.equal(canRequestAttendanceCorrection(off), false);
  assert.equal(canOpenAttendanceCorrections(off), true, "reviews via dtr_manager");
});

test("an empty role set is denied everywhere", () => {
  const none = { roles: [] as UserRole[], canAccessAttendanceCorrections: true };
  assert.equal(canRequestAttendanceCorrection(none), false);
  assert.equal(canReviewAttendanceCorrection(none.roles), false);
  assert.equal(canDirectApplyAttendanceCorrection(none.roles), false);
  assert.equal(canOpenAttendanceCorrections(none), false);
});

import {
  buildCorrectionRecord,
  datesInRange,
  dayOfWeekFor,
  resolveCorrectionSchedule,
  resolveItemSchedules,
  trailingDaysNeedingDisposition,
  trailingDutyDate,
  weekendReasonFor,
  type CorrectionItemInput,
  type TrailingDraft,
  type TrailingLoadedDay,
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

// The headline case: a night shift misread against the inherited 8-5 schedule
// becomes 0/0 once the night shift is pinned. Before the half-day rule the
// misreading showed up as 835 minutes of LATENESS; now the day's two
// incomplete sessions are charged 4 hours each instead, and the flat charge
// supersedes the lateness. Nonsense either way — that is the point of the pin.
test("pinning a night schedule clears a misread night shift", () => {
  const wrong = buildCorrectionRecord(EMP2, item({
    schedule: REGULAR, time_in_am: "21:55",
  }));
  assert.equal(wrong.undertime_minutes, 480);
  assert.equal(wrong.late_minutes, 0);

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

// --- The trailing-day warning ------------------------------------------------
//
// This rule lived inline in the correction form and was wrong there: it derived
// the trailing date from the END OF THE RANGE for every pinned day, so pinning
// a night shift to any day at all named dateTo + 1 — a date that, being outside
// the loaded range by construction, could never be suppressed. It therefore
// fired on every night pin and pointed at a day that was usually fine.

// Loaded days for a range, all with a plain unremarkable record.
const loadedRange = (dates: string[]): TrailingLoadedDay[] =>
  dates.map((date) => ({ date, has_record: true, is_absent: false }));

// A day with nothing on it — the state a trailing day is left in, and the only
// one that is at risk of reading as an absence.
const blankDay = (date: string): TrailingLoadedDay => ({
  date,
  has_record: false,
  is_absent: true,
});

const draft = (over: Partial<TrailingDraft> = {}): TrailingDraft => ({
  schedule: REGULAR,
  disposition: "update",
  include: true,
  hasTime: true,
  hasReason: false,
  ...over,
});

test("trailing days: a night shift mid-range names the day AFTER IT, not the end of the range", () => {
  const days = [
    ...loadedRange(["2026-06-01"]),
    blankDay("2026-06-02"),
    ...loadedRange(["2026-06-03", "2026-06-30"]),
  ];
  const result = trailingDaysNeedingDisposition(days, {
    // Pinned to nights on the 1st only; the 2nd is blank and unclaimed.
    "2026-06-01": draft({ schedule: NIGHT }),
    "2026-06-02": draft({ include: false }),
  });
  assert.deepEqual(result.inRange, ["2026-06-02"]);
  assert.deepEqual(result.outOfRange, []);
});

test("trailing days: the day after the last night shift is reported as out of range", () => {
  const days = loadedRange(["2026-06-29", "2026-06-30"]);
  const result = trailingDaysNeedingDisposition(days, {
    "2026-06-30": draft({ schedule: NIGHT }),
  });
  assert.deepEqual(result.outOfRange, ["2026-07-01"]);
  assert.deepEqual(result.inRange, []);
});

test("trailing days: a run of consecutive night shifts reports only its last day", () => {
  const days = loadedRange(["2026-06-01", "2026-06-02", "2026-06-03"]);
  const result = trailingDaysNeedingDisposition(days, {
    "2026-06-01": draft({ schedule: NIGHT }),
    "2026-06-02": draft({ schedule: NIGHT }),
    "2026-06-03": draft({ schedule: NIGHT }),
  });
  // The 2nd and 3rd are themselves being written, so only the 4th is left bare.
  assert.deepEqual(result.outOfRange, ["2026-06-04"]);
  assert.deepEqual(result.inRange, []);
});

test("trailing days: a day shift never reports anything", () => {
  const days = loadedRange(["2026-06-01", "2026-06-02"]);
  const result = trailingDaysNeedingDisposition(days, {
    "2026-06-01": draft(),
    "2026-06-02": draft({ include: false }),
  });
  assert.deepEqual(result, { outOfRange: [], inRange: [] });
});

test("trailing days: a trailing day already handled is not reported", () => {
  const days = loadedRange(["2026-06-01", "2026-06-02"]);
  const clearedNext = trailingDaysNeedingDisposition(days, {
    "2026-06-01": draft({ schedule: NIGHT }),
    "2026-06-02": draft({ disposition: "clear_as_off", hasTime: false }),
  });
  assert.deepEqual(clearedNext.inRange, [], "Clear as off settles the day");

  const reasonedNext = trailingDaysNeedingDisposition(days, {
    "2026-06-01": draft({ schedule: NIGHT }),
    "2026-06-02": draft({ hasTime: false, hasReason: true }),
  });
  assert.deepEqual(reasonedNext.inRange, [], "a reason settles the day");

  // Left out of the request entirely, but it already carries a real record.
  const standsAlone = trailingDaysNeedingDisposition(days, {
    "2026-06-01": draft({ schedule: NIGHT }),
    "2026-06-02": draft({ include: false }),
  });
  assert.deepEqual(standsAlone.inRange, [], "an existing non-absent row stands");
});

test("trailing days: an untouched day that is blank or already absent IS reported", () => {
  const blank: TrailingLoadedDay[] = [
    { date: "2026-06-01", has_record: true, is_absent: false },
    { date: "2026-06-02", has_record: false, is_absent: true },
  ];
  const result = trailingDaysNeedingDisposition(blank, {
    "2026-06-01": draft({ schedule: NIGHT }),
    "2026-06-02": draft({ include: false }),
  });
  assert.deepEqual(result.inRange, ["2026-06-02"]);
});

test("trailing days: a night shift the requester is CLEARING costs nothing", () => {
  const days = loadedRange(["2026-06-01", "2026-06-02"]);
  const result = trailingDaysNeedingDisposition(days, {
    "2026-06-01": draft({ schedule: NIGHT, disposition: "clear_as_off" }),
    "2026-06-02": draft({ include: false }),
  });
  assert.deepEqual(result, { outOfRange: [], inRange: [] });
});

test("trailing days: two separate night shifts report both trailing days, deduped and sorted", () => {
  const days = [
    ...loadedRange(["2026-06-01"]),
    blankDay("2026-06-02"),
    ...loadedRange(["2026-06-10"]),
    blankDay("2026-06-11"),
  ];
  const result = trailingDaysNeedingDisposition(days, {
    "2026-06-01": draft({ schedule: NIGHT }),
    "2026-06-02": draft({ include: false }),
    "2026-06-10": draft({ schedule: NIGHT }),
    "2026-06-11": draft({ include: false }),
  });
  assert.deepEqual(result.inRange, ["2026-06-02", "2026-06-11"]);
});

// --- Migration 067: weekend / leave reasons and the calendar helpers ----------

test("saturday, sunday and leave are available reasons with printable labels", () => {
  for (const r of ["saturday", "sunday", "leave"] as const) {
    assert.ok(NO_TIME_REASONS.includes(r), `${r} must be an attendance reason`);
    assert.ok(CORRECTION_REASONS.includes(r), `${r} must be selectable on a correction`);
    assert.ok(NO_TIME_REASON_LABELS[r], `${r} needs a DTR label`);
    assert.ok(NO_TIME_REASON_SHORT[r], `${r} needs a short label`);
  }
  assert.equal(NO_TIME_REASON_LABELS.saturday, "SATURDAY");
  assert.equal(NO_TIME_REASON_LABELS.sunday, "SUNDAY");
  assert.equal(NO_TIME_REASON_LABELS.leave, "LEAVE");
});

// 'holiday' stays out of the correction list: holidays are org-wide and live in
// hris.holidays, so one department declaring one per-employee would contradict
// that table. The weekend/leave codes carry no such conflict.
test("holiday remains excluded from the correction reasons", () => {
  assert.ok(NO_TIME_REASONS.includes("holiday"));
  assert.ok(!(CORRECTION_REASONS as readonly string[]).includes("holiday"));
});

// Computed via Date.UTC, so the weekday never shifts with the caller's zone —
// this value is produced on the server and read in the browser.
test("dayOfWeekFor is timezone-independent", () => {
  assert.equal(dayOfWeekFor("2026-09-19"), 6); // Saturday
  assert.equal(dayOfWeekFor("2026-09-20"), 0); // Sunday
  assert.equal(dayOfWeekFor("2026-09-21"), 1); // Monday
});

test("weekendReasonFor labels weekends and leaves weekdays alone", () => {
  assert.equal(weekendReasonFor("2026-09-19"), "saturday");
  assert.equal(weekendReasonFor("2026-09-20"), "sunday");
  // A blank WEEKDAY is a real absence until somebody says otherwise —
  // defaulting a reason onto it would quietly erase that.
  assert.equal(weekendReasonFor("2026-09-21"), null);
});

test("datesInRange is inclusive at both ends and crosses month boundaries", () => {
  assert.deepEqual(datesInRange("2026-09-19", "2026-09-21"), [
    "2026-09-19", "2026-09-20", "2026-09-21",
  ]);
  assert.deepEqual(datesInRange("2026-09-30", "2026-10-01"), [
    "2026-09-30", "2026-10-01",
  ]);
  assert.deepEqual(datesInRange("2026-09-19", "2026-09-19"), ["2026-09-19"]);
  // A leap day must survive the walk.
  assert.ok(datesInRange("2028-02-27", "2028-03-01").includes("2028-02-29"));
});

// A CREATE item has no attendance row, so no row-level pin to inherit from —
// resolution has to fall through to the employee's schedule rather than throw
// or silently pick the org default.
test("resolveItemSchedules handles a null attendance_log_id", () => {
  const employeeSched: ScheduleLike = { ...NIGHT, id: "emp" };
  const [resolved] = resolveItemSchedules(
    [{ attendance_log_id: null, proposed_schedule_id: null }],
    new Map(),
    new Map(),
    employeeSched,
    { ...REGULAR, id: "org" },
  );
  assert.equal(resolved.schedule.id, "emp");
  assert.equal(resolved.itemPinMissing, false);
});

// The reason is what stops a blank rest day being counted as an absence.
test("a blank weekend day tagged SATURDAY is not absent", () => {
  const record = buildCorrectionRecord("emp-1", {
    duty_date: "2026-09-19",
    disposition: "update",
    schedule: REGULAR,
    scheduleId: null,
    time_in_am: null, time_out_am: null, time_in_pm: null, time_out_pm: null,
    reason_in_am: "saturday", reason_out_am: "saturday",
    reason_in_pm: "saturday", reason_out_pm: "saturday",
  } as CorrectionItemInput);
  assert.equal(record.is_absent, false);
  assert.equal(record.late_minutes, 0);
  assert.equal(record.undertime_minutes, 0);
  assert.equal(record.correction_locked, true);
});

// --- Migration 068: direct-apply role boundaries ------------------------------

test("HR, super admin, DTR manager and OCM admin may apply directly", () => {
  for (const role of ["super_admin", "hr_admin", "dtr_manager", "ocm_admin"] as const) {
    assert.equal(canDirectApplyAttendanceCorrection(role), true, role);
  }
});

// The invariant the whole two-party control rests on. A department admin filing
// a request must never be able to make it take effect: if this ever returns
// true, a correction reaches a DTR with nobody but its author having seen it.
test("department admins can NEVER apply directly", () => {
  assert.equal(canDirectApplyAttendanceCorrection("department_admin"), false);
  assert.equal(
    canDirectApplyAttendanceCorrection("department_admin_and_department_head"),
    false,
  );
  assert.equal(canDirectApplyAttendanceCorrection("department_head"), false);
  assert.equal(canDirectApplyAttendanceCorrection("employee"), false);
});

// Direct-apply is NOT a widening of the requester set — the two must stay
// disjoint so "filed by" and "approved by" can never be the same person on a
// department request.
test("the requester and direct-apply sets remain disjoint", () => {
  for (const role of ["department_admin", "department_admin_and_department_head"] as const) {
    assert.equal(canRequestAttendanceCorrection(on(role)), true, role);
    assert.equal(canDirectApplyAttendanceCorrection(role), false, role);
  }
  for (const role of ["super_admin", "hr_admin", "dtr_manager"] as const) {
    assert.equal(canDirectApplyAttendanceCorrection(role), true, role);
    assert.equal(canRequestAttendanceCorrection(on(role)), false, role);
  }
});

test("canFileAttendanceCorrection admits both routes and nobody else", () => {
  for (const role of [
    "department_admin", "department_admin_and_department_head",
    "super_admin", "hr_admin", "dtr_manager", "ocm_admin",
  ] as const) {
    assert.equal(canFileAttendanceCorrection(on(role)), true, role);
  }
  for (const role of ["employee", "department_head", "jo_manager", "cos_manager"] as const) {
    assert.equal(canFileAttendanceCorrection(on(role)), false, role);
  }
  assert.equal(canFileAttendanceCorrection(on(null)), false);
  assert.equal(canFileAttendanceCorrection(on(undefined)), false);
});

// OCM Admin records attendance across departments through Manual Attendance
// Entry today. It is in neither the requester nor the reviewer set, so without
// an explicit place in the direct-apply set it would lose that reach entirely
// once manual entry is retired.
test("OCM Admin keeps cross-department attendance reach", () => {
  assert.equal(canRequestAttendanceCorrection(on("ocm_admin")), false);
  assert.equal(canReviewAttendanceCorrection("ocm_admin"), false);
  assert.equal(canDirectApplyAttendanceCorrection("ocm_admin"), true);
  assert.equal(canFileAttendanceCorrection(on("ocm_admin")), true);
});

// --- clear_as_off must read as OFF on the DTR, never HOLIDAY ------------------

test("clear_as_off states the reason at DAY level, not only per slot", () => {
  const rec = buildCorrectionRecord(EMP2, item({
    disposition: "clear_as_off",
    schedule: NIGHT,
    time_in_am: "21:55", time_out_pm: "06:05", // discarded by clear_as_off
  }));
  // The four slot reasons alone gave the DTR no day-level label, so a cleared
  // day that fell on a declared holiday printed HOLIDAY instead of OFF.
  assert.equal(rec.no_time_reason, "off");
  assert.equal(rec.time_in_am_reason, "off");
  assert.equal(rec.time_out_pm_reason, "off");
  assert.equal(rec.is_absent, false);
});

// A day the employee actually worked must keep its punches, so no_time_reason
// stays clear and the DTR shows times rather than a span.
test("an ordinary update does not set a day-level reason", () => {
  const rec = buildCorrectionRecord(EMP2, item({
    time_in_am: "08:00", time_out_pm: "17:00",
  }));
  assert.equal(rec.no_time_reason, null);
});

// --- The request narrative reaches the attendance row --------------------------

// attendance_logs.remarks is not otherwise reachable through corrections, and
// buildAttendanceRecord writes `fields.remarks || null` — so before this,
// applying a correction BLANKED whatever remark the day carried. That was
// tolerable while Manual Attendance Entry still had a remarks box; once
// corrections became the only way to write attendance it would have been a
// silent data loss on every apply.
test("a correction writes the request narrative onto the day", () => {
  const narrative = "Assigned to night rotation per Office Order 2026-114";
  const rec = buildCorrectionRecord(EMP2, item({
    time_in_am: "21:55", time_out_pm: "06:05", schedule: NIGHT,
    remarks: narrative,
  }));
  assert.equal(rec.remarks, narrative);
});

test("a cleared day carries the narrative too", () => {
  const rec = buildCorrectionRecord(EMP2, item({
    disposition: "clear_as_off",
    remarks: "Rest day per duty roster",
  }));
  assert.equal(rec.remarks, "Rest day per duty roster");
  assert.equal(rec.no_time_reason, "off");
});

test("no narrative leaves remarks null rather than an empty string", () => {
  const rec = buildCorrectionRecord(EMP2, item({ time_in_am: "08:00" }));
  assert.equal(rec.remarks, null);
});

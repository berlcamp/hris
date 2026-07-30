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

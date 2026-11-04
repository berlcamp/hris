// The Date of Filing an HR or OCM Admin can state on a leave application.
//
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import { canChangeLeaveDateFiled } from "../../src/lib/auth-helpers.ts";
import { formatManilaLongDate } from "../../src/lib/format-date.ts";
import { dateFiledError, leaveFiledOn } from "../../src/lib/leave-date-filed.ts";

const TODAY = "2026-11-04";

test("HR Admin and OCM Admin can change the filing date", () => {
  assert.equal(canChangeLeaveDateFiled("hr_admin"), true);
  assert.equal(canChangeLeaveDateFiled("ocm_admin"), true);
  assert.equal(canChangeLeaveDateFiled(["employee", "hr_admin"]), true);
});

test("no other role can change the filing date", () => {
  for (const role of [
    "super_admin",
    "hr_record_manager",
    "department_head",
    "department_admin",
    "employee",
  ] as const) {
    assert.equal(canChangeLeaveDateFiled(role), false, role);
  }
});

test("today and earlier dates are accepted", () => {
  assert.equal(dateFiledError(TODAY, TODAY), null);
  assert.equal(dateFiledError("2026-10-05", TODAY), null);
  assert.equal(dateFiledError("2024-02-29", TODAY), null);
});

test("a future date is rejected", () => {
  assert.equal(
    dateFiledError("2026-11-05", TODAY),
    "Date of filing cannot be in the future",
  );
});

test("a malformed or impossible date is rejected", () => {
  for (const bad of ["", "11/04/2026", "2026-1-5", "2026-02-31", "2026-13-01"]) {
    assert.equal(dateFiledError(bad, TODAY), "Date of filing is not a valid date", bad);
  }
});

test("a stated date wins over the day the row was created", () => {
  assert.equal(
    leaveFiledOn({ date_filed: "2026-10-05", created_at: "2026-11-04T02:00:00+00:00" }),
    "2026-10-05",
  );
});

test("with no stated date, the application was filed when it was created", () => {
  const created_at = "2026-11-04T02:00:00+00:00";
  assert.equal(leaveFiledOn({ date_filed: null, created_at }), created_at);
  assert.equal(leaveFiledOn({ created_at }), created_at);
});

test("a stated date prints as that same calendar day in Manila", () => {
  assert.equal(formatManilaLongDate("2026-10-05"), "October 5, 2026");
});

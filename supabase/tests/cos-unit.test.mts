// Pure unit tests for the COS module's non-database logic. No stack required.
//   npm run test:cos

import assert from "node:assert/strict";
import test from "node:test";
import { canManageCos } from "../../src/lib/auth-helpers.ts";
import { formatCosEmployeeName } from "../../src/lib/cos-constants.ts";

test("canManageCos admits the three COS roles", () => {
  assert.equal(canManageCos("super_admin"), true);
  assert.equal(canManageCos("hr_admin"), true);
  assert.equal(canManageCos("cos_manager"), true);
});

test("canManageCos rejects every other role", () => {
  for (const role of [
    "ocm_admin",
    "hr_record_manager",
    "department_head",
    "department_admin",
    "department_admin_and_department_head",
    "dtr_manager",
    "employee",
  ] as const) {
    assert.equal(canManageCos(role), false, `${role} must not manage COS`);
  }
});

test("canManageCos rejects null and undefined", () => {
  assert.equal(canManageCos(null), false);
  assert.equal(canManageCos(undefined), false);
});

test("formatCosEmployeeName puts the surname first", () => {
  assert.equal(
    formatCosEmployeeName({
      first_name: "Juan",
      middle_name: "Santos",
      last_name: "Dela Cruz",
      suffix: "Jr.",
    }),
    "Dela Cruz, Juan Santos Jr.",
  );
});

test("formatCosEmployeeName collapses an absent middle name and suffix", () => {
  assert.equal(
    formatCosEmployeeName({
      first_name: "Maria",
      middle_name: null,
      last_name: "Reyes",
      suffix: null,
    }),
    "Reyes, Maria",
  );
});

test("formatCosEmployeeName treats whitespace-only parts as absent", () => {
  assert.equal(
    formatCosEmployeeName({
      first_name: "Ana",
      middle_name: "   ",
      last_name: "Lim",
      suffix: "",
    }),
    "Lim, Ana",
  );
});

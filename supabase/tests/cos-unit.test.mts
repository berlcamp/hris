// Pure unit tests for the COS module's non-database logic. No stack required.
//   npm run test:cos

import assert from "node:assert/strict";
import test from "node:test";
import { canManageCos } from "../../src/lib/auth-helpers.ts";
import { formatCosEmployeeName } from "../../src/lib/cos-constants.ts";
import { cosEmployeeFormSchema } from "../../src/lib/validations/cos-employee-schema.ts";

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

function minimalPayload(overrides: Record<string, unknown> = {}) {
  return {
    cos_no: "COS-001",
    first_name: "Juan",
    last_name: "Dela Cruz",
    ...overrides,
  };
}

test("cosEmployeeFormSchema normalises a blank department_id to null", () => {
  const result = cosEmployeeFormSchema.safeParse(
    minimalPayload({ department_id: "" }),
  );

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.department_id, null);
  }
});

test("cosEmployeeFormSchema normalises a blank sex to null", () => {
  const result = cosEmployeeFormSchema.safeParse(minimalPayload({ sex: "" }));

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.sex, null);
  }
});

test("cosEmployeeFormSchema still rejects a non-UUID department_id", () => {
  const result = cosEmployeeFormSchema.safeParse(
    minimalPayload({ department_id: "not-a-uuid" }),
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues[0]?.message, "Select a department");
  }
});

test("cosEmployeeFormSchema still rejects an out-of-range sex", () => {
  const result = cosEmployeeFormSchema.safeParse(
    minimalPayload({ sex: "unknown" }),
  );

  assert.equal(result.success, false);
});

test("cosEmployeeFormSchema normalises a whitespace-only optional text field to null", () => {
  const result = cosEmployeeFormSchema.safeParse(
    minimalPayload({ middle_name: "   " }),
  );

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.middle_name, null);
  }
});

test("cosEmployeeFormSchema normalises a blank email to null and rejects an invalid one", () => {
  const blank = cosEmployeeFormSchema.safeParse(
    minimalPayload({ email: "" }),
  );
  assert.equal(blank.success, true);
  if (blank.success) {
    assert.equal(blank.data.email, null);
  }

  const invalid = cosEmployeeFormSchema.safeParse(
    minimalPayload({ email: "nope" }),
  );
  assert.equal(invalid.success, false);
});

test("cosEmployeeFormSchema parses a minimal payload and defaults status to active", () => {
  const result = cosEmployeeFormSchema.safeParse(minimalPayload());

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.status, "active");
  }
});

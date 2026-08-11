// Unit tests for `canManageJobOrderPayroll` (src/lib/auth-helpers.ts) — the
// per-account switch that separates "reaches the Job Order module" from "may
// write its payrolls" (migration 077).
//
// Worth its own file for the same reason job-order-payroll-guards.test.mts
// exists: RLS on job_order_payrolls is
// `FOR ALL USING (role IN ('super_admin','hr_admin','jo_manager'))`, which
// knows nothing about this flag. The TypeScript guard is the only thing
// standing between a read-only JO Manager and a payroll write, so its truth
// table is tested directly.
//
// The two cases that actually matter and are easy to get wrong:
//   - the flag must NOT leak onto super_admin / hr_admin, who hold payroll
//     through their role and never see the checkbox
//   - a missing/undefined flag must read as ON, so a caller holding a user
//     object shaped before migration 077 keeps the access its role grants
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import { canManageJobOrderPayroll } from "../../src/lib/auth-helpers.ts";

// ── The switch applies to the module-manager roles ──────────────────

test("jo_manager with the switch on may write payroll", () => {
  assert.equal(
    canManageJobOrderPayroll({
      role: "jo_manager",
      canManageModulePayroll: true,
    }),
    true,
  );
});

test("jo_manager with the switch off may not write payroll", () => {
  assert.equal(
    canManageJobOrderPayroll({
      role: "jo_manager",
      canManageModulePayroll: false,
    }),
    false,
  );
});

// ── The switch does not leak onto roles that never see the checkbox ──

test("super_admin keeps payroll write access even with the flag off", () => {
  assert.equal(
    canManageJobOrderPayroll({
      role: "super_admin",
      canManageModulePayroll: false,
    }),
    true,
  );
});

test("hr_admin keeps payroll write access even with the flag off", () => {
  assert.equal(
    canManageJobOrderPayroll({
      role: "hr_admin",
      canManageModulePayroll: false,
    }),
    true,
  );
});

// ── Missing flag reads as ON (pre-migration-077 user objects) ────────

test("an undefined flag reads as ON for jo_manager", () => {
  assert.equal(canManageJobOrderPayroll({ role: "jo_manager" }), true);
});

test("a null flag reads as ON for jo_manager", () => {
  assert.equal(
    canManageJobOrderPayroll({
      role: "jo_manager",
      canManageModulePayroll: null,
    }),
    true,
  );
});

// ── The flag never GRANTS module access ─────────────────────────────
// A role outside the Job Order module stays out no matter what the flag says —
// cos_manager included, which is a module manager but not a Job Order one.

test("cos_manager cannot write JO payroll even with the switch on", () => {
  assert.equal(
    canManageJobOrderPayroll({
      role: "cos_manager",
      canManageModulePayroll: true,
    }),
    false,
  );
});

test("employee cannot write JO payroll even with the switch on", () => {
  assert.equal(
    canManageJobOrderPayroll({
      role: "employee",
      canManageModulePayroll: true,
    }),
    false,
  );
});

test("a null role cannot write JO payroll", () => {
  assert.equal(
    canManageJobOrderPayroll({ role: null, canManageModulePayroll: true }),
    false,
  );
});

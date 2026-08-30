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
//   - since migration 087 an account holds a SET of roles, and the switch
//     qualifies the MODULE-MANAGER grant rather than the account: turning it
//     off for a JO Manager hat must not take away an HR Admin one
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
      roles: ["jo_manager"],
      canManageModulePayroll: true,
    }),
    true,
  );
});

test("jo_manager with the switch off may not write payroll", () => {
  assert.equal(
    canManageJobOrderPayroll({
      roles: ["jo_manager"],
      canManageModulePayroll: false,
    }),
    false,
  );
});

// ── The switch does not leak onto roles that never see the checkbox ──

test("super_admin keeps payroll write access even with the flag off", () => {
  assert.equal(
    canManageJobOrderPayroll({
      roles: ["super_admin"],
      canManageModulePayroll: false,
    }),
    true,
  );
});

test("hr_admin keeps payroll write access even with the flag off", () => {
  assert.equal(
    canManageJobOrderPayroll({
      roles: ["hr_admin"],
      canManageModulePayroll: false,
    }),
    true,
  );
});

// ── Missing flag reads as ON (pre-migration-077 user objects) ────────

test("an undefined flag reads as ON for jo_manager", () => {
  assert.equal(canManageJobOrderPayroll({ roles: ["jo_manager"] }), true);
});

test("a null flag reads as ON for jo_manager", () => {
  assert.equal(
    canManageJobOrderPayroll({
      roles: ["jo_manager"],
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
      roles: ["cos_manager"],
      canManageModulePayroll: true,
    }),
    false,
  );
});

test("employee cannot write JO payroll even with the switch on", () => {
  assert.equal(
    canManageJobOrderPayroll({
      roles: ["employee"],
      canManageModulePayroll: true,
    }),
    false,
  );
});

test("a null role cannot write JO payroll", () => {
  assert.equal(
    canManageJobOrderPayroll({ roles: null, canManageModulePayroll: true }),
    false,
  );
});

// ── Multiple roles per account (migration 087) ──────────────────────

// The switch belongs to the jo_manager grant. An account that also holds
// hr_admin writes payroll through THAT role, which never saw the checkbox.
test("the switch does not reach an account that is also hr_admin", () => {
  assert.equal(
    canManageJobOrderPayroll({
      roles: ["jo_manager", "hr_admin"],
      canManageModulePayroll: false,
    }),
    true,
  );
});

// Union of grants: a second role adds the module the first one lacked.
test("cos_manager who is also jo_manager may write JO payroll", () => {
  assert.equal(
    canManageJobOrderPayroll({
      roles: ["cos_manager", "jo_manager"],
      canManageModulePayroll: true,
    }),
    true,
  );
});

// ...and the switch still bites when every role it holds is a module manager.
test("cos_manager who is also jo_manager is stopped by the switch", () => {
  assert.equal(
    canManageJobOrderPayroll({
      roles: ["cos_manager", "jo_manager"],
      canManageModulePayroll: false,
    }),
    false,
  );
});

test("an empty role set cannot write JO payroll", () => {
  assert.equal(
    canManageJobOrderPayroll({ roles: [], canManageModulePayroll: true }),
    false,
  );
});

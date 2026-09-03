// Unit tests for the pure Job Order payroll guards
// (`src/lib/job-order-payroll-guards.ts`).
//
// The finalize/reopen lifecycle was removed — every payroll is editable — so
// the remaining invariants are: a missing or soft-deleted payroll rejects
// writes, and delete is restricted to super_admin. Neither is enforced by the
// DB's RLS (`FOR ALL USING (role IN ('super_admin','hr_admin','jo_manager'))`,
// which does not distinguish super_admin from the other two roles), so these
// TypeScript-level checks are the only line of defence.
//
// `decideWriteGate` is tested directly against plain `{ deleted_at }` objects
// rather than through `assertWritable` with a mocked Supabase client — a
// hand-written stub of the `.schema().from().select().eq().maybeSingle()`
// fluent chain would mostly test the stub, not the guard. See the module doc
// in job-order-payroll-guards.ts for the full reasoning.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  canDeletePayroll,
  decideWriteGate,
} from "../../src/lib/job-order-payroll-guards.ts";

// ── decideWriteGate ─────────────────────────────────────────────────

test("decideWriteGate blocks a missing payroll (null row)", () => {
  assert.equal(decideWriteGate(null), "Payroll not found");
});

test("decideWriteGate blocks a soft-deleted payroll", () => {
  const blocked = decideWriteGate({
    deleted_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(blocked, "Payroll not found");
});

test("decideWriteGate passes a not-deleted payroll", () => {
  assert.equal(decideWriteGate({ deleted_at: null }), null);
});

// ── canDeletePayroll ────────────────────────────────────────────────

test("canDeletePayroll accepts super_admin", () => {
  assert.equal(canDeletePayroll("super_admin"), true);
});

for (const role of [
  "hr_admin",
  "jo_manager",
  "department_head",
  "employee",
  undefined,
] as const) {
  test(`canDeletePayroll rejects ${role ?? "undefined"}`, () => {
    assert.equal(canDeletePayroll(role), false);
  });
}

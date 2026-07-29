// Unit tests for the pure Job Order payroll guards
// (`src/lib/job-order-payroll-guards.ts`).
//
// These cover the two invariants the whole Job Order Payroll feature exists
// to enforce (spec: docs/superpowers/specs/2026-07-29-jo-payroll-design.md
// lines 450-451) — a finalized payroll rejects writes, and reopen/delete is
// restricted to super_admin — neither of which had a test before this file,
// and neither of which the DB's RLS enforces (RLS is
// `FOR ALL USING (role IN ('super_admin','hr_admin','jo_manager'))`, which
// does not distinguish draft from finalized or super_admin from the other
// two roles). These TypeScript-level checks are the only line of defence.
//
// `decideDraftGate` is tested directly against plain `{ status, deleted_at }`
// objects rather than through `assertDraft` with a mocked Supabase client —
// a hand-written stub of the `.schema().from().select().eq().maybeSingle()`
// fluent chain would mostly test the stub, not the guard. See the module doc
// in job-order-payroll-guards.ts for the full reasoning.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  canReopenOrDeletePayroll,
  decideDraftGate,
} from "../../src/lib/job-order-payroll-guards.ts";

// ── decideDraftGate ─────────────────────────────────────────────────

test("decideDraftGate blocks a missing payroll (null row)", () => {
  assert.equal(decideDraftGate(null), "Payroll not found");
});

test("decideDraftGate blocks a soft-deleted payroll even if status is draft", () => {
  const blocked = decideDraftGate({
    status: "draft",
    deleted_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(blocked, "Payroll not found");
});

test("decideDraftGate blocks a finalized payroll", () => {
  const blocked = decideDraftGate({ status: "finalized", deleted_at: null });
  assert.equal(
    blocked,
    "This payroll is finalized. Reopen it before making changes.",
  );
});

test("decideDraftGate passes a draft, not-deleted payroll", () => {
  assert.equal(decideDraftGate({ status: "draft", deleted_at: null }), null);
});

// ── canReopenOrDeletePayroll ────────────────────────────────────────

test("canReopenOrDeletePayroll accepts super_admin", () => {
  assert.equal(canReopenOrDeletePayroll("super_admin"), true);
});

for (const role of [
  "hr_admin",
  "jo_manager",
  "department_head",
  "employee",
  undefined,
] as const) {
  test(`canReopenOrDeletePayroll rejects ${role ?? "undefined"}`, () => {
    assert.equal(canReopenOrDeletePayroll(role), false);
  });
}

/**
 * Plain (non-`"use server"`) authorization guards for Job Order payrolls.
 *
 * Two checks stand between a payroll and a write: `decideWriteGate` (does this
 * payroll still exist, and is it unlocked?) and `canDeletePayroll` (may this
 * role remove one?).
 * RLS on `job_order_payrolls`/`job_order_payroll_members` is `FOR ALL USING
 * (role IN ('super_admin','hr_admin','jo_manager'))` — it does NOT distinguish
 * super_admin from the other two roles. These TypeScript checks are the only
 * line of defence, which is why they live in a plain module: importable from a
 * unit test with zero Supabase/Next runtime, no `"use server"` boundary, no
 * mocking a fluent `.schema().from().select()...` chain.
 *
 * Locking reuses the old finalize lifecycle's `status` column: `finalized`
 * means locked, `draft` means open. Unlike the old lifecycle there is no DRAFT
 * watermark and anyone with payroll write access can lock or unlock — the lock
 * guards against accidental edits, it is not an approval step.
 * `decideWriteGate` is split out from `assertWritable` so the branching —
 * missing row / soft-deleted / locked — can be tested directly against a plain
 * object. A stub that mimics the Supabase query builder would mostly be
 * testing the stub.
 */

import type { UserRole } from "@/lib/types";

import type { createAdminClient } from "@/lib/supabase/admin";

export interface WriteGateRow {
  status: string;
  deleted_at: string | null;
}

export const PAYROLL_LOCKED_ERROR =
  "This payroll is locked. Unlock it before making changes.";

/** `status` is the lock flag — see the module doc. */
export function isPayrollLocked(row: { status: string }): boolean {
  return row.status === "finalized";
}

/**
 * Pure decision: given the payroll row (or `null` if none was found), is it
 * open for writes? Returns an error message when blocked, `null` when clear.
 */
export function decideWriteGate(row: WriteGateRow | null): string | null {
  if (!row || row.deleted_at) return "Payroll not found";
  if (isPayrollLocked(row)) return PAYROLL_LOCKED_ERROR;
  return null;
}

/**
 * Shared write guard. Returns an error string when the payroll is missing,
 * soft-deleted or locked, otherwise null.
 */
export async function assertWritable(
  supabase: ReturnType<typeof createAdminClient>,
  payrollId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select("id, status, deleted_at")
    .eq("id", payrollId)
    .maybeSingle();
  if (error) return error.message;
  return decideWriteGate(data as WriteGateRow | null);
}

/**
 * Only `super_admin` may delete a payroll. `hr_admin` and `jo_manager` hold
 * day-to-day payroll management (`canManageJobOrders`) but not this — deleting
 * is the one action in this module reserved for super_admin alone.
 */
export function canDeletePayroll(
  // Spelled out rather than imported as RoleInput from auth-helpers: this
  // module is loaded by a test that runs under bare `node --experimental-
  // strip-types`, which resolves no "@/" alias. A type-only import is stripped
  // before it ever reaches the resolver; a value import would not be.
  roles: UserRole | readonly UserRole[] | null | undefined,
): boolean {
  if (!roles) return false;
  return typeof roles === "string"
    ? roles === "super_admin"
    : roles.includes("super_admin");
}

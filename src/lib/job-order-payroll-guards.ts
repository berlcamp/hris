/**
 * Plain (non-`"use server"`) authorization guards for Job Order payrolls.
 *
 * These are the only two checks standing between a finalized payroll — an
 * issued government record — and a write: `decideDraftGate` (is this payroll
 * open for edits?) and `canReopenOrDeletePayroll` (may this role unlock or
 * remove one?). RLS on `job_order_payrolls`/`job_order_payroll_members` is
 * `FOR ALL USING (role IN ('super_admin','hr_admin','jo_manager'))` — it does
 * NOT distinguish draft from finalized, or super_admin from the other two
 * roles. These TypeScript checks are the only line of defence, which is why
 * they live in a plain module: importable from a unit test with zero
 * Supabase/Next runtime, no `"use server"` boundary, no mocking a fluent
 * `.schema().from().select()...` chain.
 *
 * `decideDraftGate` is split out from `assertDraft` so the actual branching
 * logic — missing row / soft-deleted / finalized / draft — can be tested
 * directly against a plain object. A stub that mimics the Supabase query
 * builder would mostly be testing the stub; testing the decision function
 * against `{ status, deleted_at } | null` inputs tests the real logic.
 */

import type { UserRole } from "@/lib/types";

import type { createAdminClient } from "@/lib/supabase/admin";

export interface DraftGateRow {
  status: string;
  deleted_at: string | null;
}

/**
 * Pure decision: given the payroll row (or `null` if none was found), is it
 * open for writes? Returns an error message when blocked, `null` when clear.
 */
export function decideDraftGate(row: DraftGateRow | null): string | null {
  if (!row || row.deleted_at) return "Payroll not found";
  if (row.status !== "draft") {
    return "This payroll is finalized. Reopen it before making changes.";
  }
  return null;
}

/**
 * Shared draft guard. Returns an error string when the payroll is missing or
 * already finalized, otherwise null. A finalized payroll is an issued record;
 * only `reopenJobOrderPayroll` (super_admin) can unlock it.
 */
export async function assertDraft(
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
  return decideDraftGate(data as DraftGateRow | null);
}

/**
 * Only `super_admin` may reopen a finalized payroll or delete any payroll
 * (draft or finalized). `hr_admin` and `jo_manager` hold day-to-day payroll
 * management (`canManageJobOrders`) but not this — reopening or deleting is
 * the one action in this module reserved for super_admin alone.
 */
export function canReopenOrDeletePayroll(
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

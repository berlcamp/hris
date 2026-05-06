import type { createAdminClient } from "@/lib/supabase/admin";

export type LedgerSource =
  | "monthly_accrual"
  | "csv_import"
  | "adjustment"
  | "carryover"
  | "seed";

export type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const ACCRUING_LEAVE_CODES = ["VL", "SL"] as const;
export type AccruingLeaveCode = (typeof ACCRUING_LEAVE_CODES)[number];

/**
 * Append a row to the leave-credit accrual ledger.
 * Returns whether the row was actually inserted (false on idempotency conflict).
 */
export async function addLedgerEntry(
  supabase: SupabaseAdmin,
  input: {
    employee_id: string;
    leave_type_id: string;
    year: number;
    month?: number | null;
    amount: number;
    source: LedgerSource;
    notes?: string | null;
    created_by?: string | null;
    onConflict?: "ignore" | "error";
  }
): Promise<{ inserted: boolean; error: string | null }> {
  const { onConflict = "error", ...row } = input;

  const { error } = await supabase
    .schema("hris")
    .from("leave_credit_accruals")
    .insert({
      employee_id: row.employee_id,
      leave_type_id: row.leave_type_id,
      year: row.year,
      month: row.month ?? null,
      amount: row.amount,
      source: row.source,
      notes: row.notes ?? null,
      created_by: row.created_by ?? null,
    });

  if (error) {
    if (onConflict === "ignore" && error.code === "23505") {
      return { inserted: false, error: null };
    }
    return { inserted: false, error: error.message };
  }
  return { inserted: true, error: null };
}

/**
 * Replace any existing csv_import ledger row for (employee, leave_type, year) with
 * a single new row carrying the supplied total. Used by the bulk CSV importer so
 * that re-imports overwrite the prior baseline cleanly.
 */
export async function replaceCsvImportLedger(
  supabase: SupabaseAdmin,
  input: {
    employee_id: string;
    leave_type_id: string;
    year: number;
    amount: number;
    notes?: string | null;
    created_by?: string | null;
  }
): Promise<{ error: string | null }> {
  const del = await supabase
    .schema("hris")
    .from("leave_credit_accruals")
    .delete()
    .eq("employee_id", input.employee_id)
    .eq("leave_type_id", input.leave_type_id)
    .eq("year", input.year)
    .eq("source", "csv_import");
  if (del.error) return { error: del.error.message };

  const { error } = await addLedgerEntry(supabase, {
    ...input,
    source: "csv_import",
    month: null,
  });
  return { error };
}

/**
 * Recompute leave_credits.total_credits = SUM(ledger.amount) for the given
 * (employee, leave_type, year) and upsert the row. Used credits are derived
 * from approved leave_applications via the leave_credit_balances view.
 */
export async function recomputeLeaveCreditTotal(
  supabase: SupabaseAdmin,
  input: {
    employee_id: string;
    leave_type_id: string;
    year: number;
  }
): Promise<{ total: number; error: string | null }> {
  const { data: rows, error: sumErr } = await supabase
    .schema("hris")
    .from("leave_credit_accruals")
    .select("amount")
    .eq("employee_id", input.employee_id)
    .eq("leave_type_id", input.leave_type_id)
    .eq("year", input.year);
  if (sumErr) return { total: 0, error: sumErr.message };

  const total = (rows ?? []).reduce((acc, r) => acc + Number(r.amount), 0);

  const { data: existing } = await supabase
    .schema("hris")
    .from("leave_credits")
    .select("id")
    .eq("employee_id", input.employee_id)
    .eq("leave_type_id", input.leave_type_id)
    .eq("year", input.year)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .schema("hris")
      .from("leave_credits")
      .update({ total_credits: total })
      .eq("id", existing.id);
    if (error) return { total, error: error.message };
  } else {
    const { error } = await supabase
      .schema("hris")
      .from("leave_credits")
      .insert({
        employee_id: input.employee_id,
        leave_type_id: input.leave_type_id,
        year: input.year,
        total_credits: total,
      });
    if (error) return { total, error: error.message };
  }

  return { total, error: null };
}

export interface LeaveTypeLite {
  id: string;
  code: string;
  max_credits: number | null;
  is_cumulative: boolean | null;
  annual_credits: number | null;
}

export async function getLeaveTypeMap(
  supabase: SupabaseAdmin
): Promise<{ byId: Map<string, LeaveTypeLite>; byCode: Map<string, LeaveTypeLite> }> {
  const { data } = await supabase
    .schema("hris")
    .from("leave_types")
    .select("id, code, max_credits, is_cumulative, annual_credits");
  const byId = new Map<string, LeaveTypeLite>();
  const byCode = new Map<string, LeaveTypeLite>();
  for (const lt of data ?? []) {
    const v: LeaveTypeLite = {
      id: lt.id,
      code: String(lt.code),
      max_credits: lt.max_credits,
      is_cumulative: lt.is_cumulative,
      annual_credits:
        (lt as { annual_credits?: number | null }).annual_credits ?? null,
    };
    byId.set(v.id, v);
    byCode.set(v.code, v);
  }
  return { byId, byCode };
}

/**
 * Monthly accrual amount derived from the per-year setting (e.g. 15 → 1.25/mo).
 * Defaults to 0 if the input is non-finite or non-positive.
 */
export function monthlyAccrualFromAnnual(annual: number): number {
  if (!Number.isFinite(annual) || annual <= 0) return 0;
  return Math.round((annual / 12) * 10000) / 10000;
}

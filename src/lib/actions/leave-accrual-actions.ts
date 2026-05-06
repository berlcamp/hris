"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  addLedgerEntry,
  getLeaveTypeMap,
  monthlyAccrualFromAnnual,
  recomputeLeaveCreditTotal,
} from "@/lib/leave-credits-helpers";

function requireHrAdmin(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user) return "Unauthorized" as const;
  if (!["super_admin", "hr_admin"].includes(user.role))
    return "Insufficient permissions" as const;
  return null;
}

export interface AccrualSummary {
  year: number;
  month: number;
  amounts: { code: string; per_employee: number }[];
  employeesProcessed: number;
  rowsInserted: number;
  rowsSkipped: number;
  errors: string[];
}

/**
 * Run monthly accrual for VL/SL (or other accruing types in
 * ACCRUING_LEAVE_CODES). Idempotent: a unique index on
 * (employee_id, leave_type_id, year, month) WHERE source='monthly_accrual'
 * causes duplicates to no-op silently.
 */
export async function accrueMonthlyLeaveCredits(
  year: number,
  month: number
): Promise<{ ok: true; summary: AccrualSummary } | { error: string }> {
  const user = await getCurrentUser();
  const deny = requireHrAdmin(user);
  if (deny || !user) return { error: deny ?? "Unauthorized" };

  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    return { error: "Invalid year" };
  if (!Number.isInteger(month) || month < 1 || month > 12)
    return { error: "Invalid month" };

  const supabase = createAdminClient();
  const { byCode } = await getLeaveTypeMap(supabase);

  const accruingTypes: { id: string; code: string; amount: number }[] = [];
  for (const lt of byCode.values()) {
    const annual = Number(lt.annual_credits ?? 0);
    if (!Number.isFinite(annual) || annual <= 0) continue;
    accruingTypes.push({
      id: lt.id,
      code: lt.code,
      amount: monthlyAccrualFromAnnual(annual),
    });
  }

  if (accruingTypes.length === 0) {
    return {
      error:
        "No accruing leave types configured. Set annual_credits on VL/SL leave types (System Settings).",
    };
  }

  const { data: employees, error: empErr } = await supabase
    .schema("hris")
    .from("employees")
    .select("id")
    .eq("status", "active");
  if (empErr) return { error: empErr.message };

  const empList = employees ?? [];
  let rowsInserted = 0;
  let rowsSkipped = 0;
  const errors: string[] = [];

  for (const emp of empList) {
    for (const lt of accruingTypes) {
      const { inserted, error } = await addLedgerEntry(supabase, {
        employee_id: emp.id,
        leave_type_id: lt.id,
        year,
        month,
        amount: lt.amount,
        source: "monthly_accrual",
        notes: `${lt.code} accrual ${year}-${String(month).padStart(2, "0")}`,
        created_by: user.id,
        onConflict: "ignore",
      });
      if (error) {
        errors.push(`Employee ${emp.id} ${lt.code}: ${error}`);
        continue;
      }
      if (inserted) {
        rowsInserted++;
        const { error: recompErr } = await recomputeLeaveCreditTotal(supabase, {
          employee_id: emp.id,
          leave_type_id: lt.id,
          year,
        });
        if (recompErr) {
          errors.push(`Employee ${emp.id} ${lt.code} recompute: ${recompErr}`);
        }
      } else {
        rowsSkipped++;
      }
    }
  }

  const summary: AccrualSummary = {
    year,
    month,
    amounts: accruingTypes.map((a) => ({
      code: a.code,
      per_employee: a.amount,
    })),
    employeesProcessed: empList.length,
    rowsInserted,
    rowsSkipped,
    errors,
  };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "leave_credits_monthly_accrual",
    tableName: "leave_credit_accruals",
    newValues: {
      year,
      month,
      employees: empList.length,
      inserted: rowsInserted,
      skipped: rowsSkipped,
      errors: errors.length,
    },
  });

  revalidatePath("/leaves/credits");
  return { ok: true, summary };
}

/**
 * Backfill missing monthly accruals from `fromMonth` through `toMonth` for
 * the given year. Idempotent — already-accrued months are silently skipped.
 */
export async function backfillMonthlyLeaveCredits(
  year: number,
  fromMonth: number,
  toMonth: number
): Promise<
  | { ok: true; runs: AccrualSummary[] }
  | { error: string }
> {
  if (fromMonth > toMonth) return { error: "fromMonth must be <= toMonth" };

  const runs: AccrualSummary[] = [];
  for (let m = fromMonth; m <= toMonth; m++) {
    const result = await accrueMonthlyLeaveCredits(year, m);
    if ("error" in result) return { error: `Month ${m}: ${result.error}` };
    runs.push(result.summary);
  }
  return { ok: true, runs };
}

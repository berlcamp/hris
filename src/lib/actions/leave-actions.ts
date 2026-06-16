"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import {
  isCompositeDeptAdminHead,
  isDeptHead,
  isDeptScoped,
} from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  addLedgerEntry,
  recomputeLeaveCreditTotal,
} from "@/lib/leave-credits-helpers";
import { formatEmployeeDisplayName } from "@/lib/employee-name-match";

export interface LeaveTypeRow {
  id: string;
  code: string;
  name: string;
  max_credits: number | null;
  is_cumulative: boolean;
  is_convertible: boolean;
  applicable_to: string;
}

export interface LeaveCreditRow {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  total_credits: number;
  used_credits: number;
  balance: number;
  leave_types: { code: string; name: string } | null;
  employees: {
    first_name: string;
    last_name: string;
    biometric_no: number;
    vl_sl_needs_manual_entry: boolean;
    departments: { name: string; code: string } | null;
  } | null;
}

// Note: days_with_pay is the portion of days_applied that consumes credits;
// (days_applied - days_with_pay) is leave without pay.
export interface LeaveApplicationWithRelations {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_applied: number;
  days_with_pay: number;
  reason: string | null;
  details_of_leave: string | null;
  commutation_requested: boolean;
  leave_dates: string[];
  status: string;
  department_head_id: string | null;
  hr_reviewer_id: string | null;
  dept_approved_at: string | null;
  hr_approved_at: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  employees: {
    first_name: string;
    last_name: string;
    middle_name: string | null;
    suffix: string | null;
    salary_grade: number;
    biometric_no: number;
    department_id: string | null;
    employment_type: string;
    vl_sl_needs_manual_entry: boolean;
    departments: { name: string; code: string } | null;
    positions: { title: string } | null;
    plantilla: { position_title: string | null }[] | null;
  } | null;
  leave_types: { code: string; name: string } | null;
  created_by_profile: { role: string } | null;
}

// ── Leave Types ────────────────────────────────────────────────────

export async function getLeaveTypes(): Promise<LeaveTypeRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("leave_types")
    .select("*")
    .order("code");
  if (error) throw error;
  return data as LeaveTypeRow[];
}

// ── Leave Credits ──────────────────────────────────────────────────

export async function getLeaveCreditsForYear(year: number): Promise<LeaveCreditRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("leave_credit_balances")
    .select(`
      *,
      leave_types(code, name),
      employees(
        first_name, last_name, biometric_no, vl_sl_needs_manual_entry,
        departments!employees_department_id_fkey(name, code)
      )
    `)
    .eq("year", year)
    .order("employee_id");

  if (user.role === "employee") {
    // Get employee record for this user
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("user_profile_id", user.id)
      .maybeSingle();
    if (!emp) return [];
    query = query.eq("employee_id", emp.id);
  } else if (
    isDeptScoped(user.role) &&
    !isCompositeDeptAdminHead(user.role) &&
    user.departmentId
  ) {
    const { data: deptEmps } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("department_id", user.departmentId);
    const ids = (deptEmps ?? []).map((e) => e.id);
    if (ids.length === 0) return [];
    query = query.in("employee_id", ids);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as LeaveCreditRow[];
}

export async function getEmployeeLeaveCredits(employeeId: string, year: number) {
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  // Department-scoped users can only read credits for employees in their own
  // department. The composite Dept Admin + Head role is exempt — it reads
  // across all departments within the Leave module.
  if (
    user &&
    isDeptScoped(user.role) &&
    !isCompositeDeptAdminHead(user.role)
  ) {
    if (!user.departmentId) return [];
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("department_id")
      .eq("id", employeeId)
      .maybeSingle();
    if (!emp || emp.department_id !== user.departmentId) return [];
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("leave_credit_balances")
    .select("*, leave_types(code, name)")
    .eq("employee_id", employeeId)
    .eq("year", year);
  if (error) throw error;
  return data as LeaveCreditRow[];
}

/**
 * Provision a year's leave-credit baseline for one employee.
 *
 * Behavior (ledger-based):
 *   - VL / SL (accruing types): writes a `carryover` ledger row with the prior
 *     year's remaining balance (if cumulative and > 0). Does NOT seed the full
 *     annual amount — monthly accrual fills that in.
 *   - Other types with max_credits (SPL, FL, ML, …): writes a `seed` ledger
 *     row equal to max_credits.
 *   - Skips any leave type that already has at least one ledger row for the
 *     given (employee, year) so re-running is a safe no-op.
 *
 * After writing ledger rows, the corresponding leave_credits.total_credits is
 * recomputed as SUM(ledger.amount) for that (employee, leave_type, year).
 */
export async function provisionLeaveCredits(employeeId: string, year: number) {
  const supabase = createAdminClient();

  const { data: leaveTypes } = await supabase
    .schema("hris")
    .from("leave_types")
    .select("id, code, max_credits, is_cumulative, annual_credits");
  if (!leaveTypes) return { error: "Failed to fetch leave types" };

  const { data: existingLedger } = await supabase
    .schema("hris")
    .from("leave_credit_accruals")
    .select("leave_type_id")
    .eq("employee_id", employeeId)
    .eq("year", year);
  const seededTypeIds = new Set((existingLedger ?? []).map((r) => r.leave_type_id));

  let provisioned = 0;
  for (const lt of leaveTypes) {
    if (seededTypeIds.has(lt.id)) continue;

    const annual = Number(
      (lt as { annual_credits?: number | null }).annual_credits ?? 0
    );
    const isAccruing = Number.isFinite(annual) && annual > 0;

    if (isAccruing) {
      if (lt.is_cumulative) {
        const { data: prev } = await supabase
          .schema("hris")
          .from("leave_credit_balances")
          .select("balance")
          .eq("employee_id", employeeId)
          .eq("leave_type_id", lt.id)
          .eq("year", year - 1)
          .maybeSingle();
        const carryAmount = prev && prev.balance ? Number(prev.balance) : 0;
        if (carryAmount > 0) {
          const { error } = await addLedgerEntry(supabase, {
            employee_id: employeeId,
            leave_type_id: lt.id,
            year,
            amount: carryAmount,
            source: "carryover",
            notes: `Carried over from ${year - 1}`,
          });
          if (error) return { error };
          await recomputeLeaveCreditTotal(supabase, {
            employee_id: employeeId,
            leave_type_id: lt.id,
            year,
          });
          provisioned++;
        }
      }
      continue;
    }

    if (lt.max_credits && Number(lt.max_credits) > 0) {
      const amount = Number(lt.max_credits);
      const { error } = await addLedgerEntry(supabase, {
        employee_id: employeeId,
        leave_type_id: lt.id,
        year,
        amount,
        source: "seed",
        notes: `Annual seed for ${lt.code}`,
      });
      if (error) return { error };
      await recomputeLeaveCreditTotal(supabase, {
        employee_id: employeeId,
        leave_type_id: lt.id,
        year,
      });
      provisioned++;
    }
  }

  revalidatePath("/leaves/credits");
  return { success: true, provisioned };
}

export async function adjustLeaveCredit(input: {
  employee_id: string;
  leave_type_id: string;
  year: number;
  adjustment: number;
  reason: string;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["super_admin", "hr_admin"].includes(user.role))
    return { error: "Insufficient permissions" };

  const supabase = createAdminClient();

  // Compute the resulting total to enforce non-negative balance.
  const { data: prior } = await supabase
    .schema("hris")
    .from("leave_credit_accruals")
    .select("amount")
    .eq("employee_id", input.employee_id)
    .eq("leave_type_id", input.leave_type_id)
    .eq("year", input.year);
  const currentTotal = (prior ?? []).reduce(
    (acc, r) => acc + Number(r.amount),
    0
  );
  const newTotal = currentTotal + input.adjustment;
  if (newTotal < 0)
    return { error: "Adjustment would result in negative credits" };

  const { error: ledgerError } = await addLedgerEntry(supabase, {
    employee_id: input.employee_id,
    leave_type_id: input.leave_type_id,
    year: input.year,
    amount: input.adjustment,
    source: "adjustment",
    notes: input.reason,
    created_by: user.id,
  });
  if (ledgerError) return { error: ledgerError };

  const { error: recomputeError } = await recomputeLeaveCreditTotal(supabase, {
    employee_id: input.employee_id,
    leave_type_id: input.leave_type_id,
    year: input.year,
  });
  if (recomputeError) return { error: recomputeError };

  // The "needs reconciliation" flag is cleared by a DB trigger
  // (migration 027) once HR has adjusted BOTH VL and SL.
  const { data: lt } = await supabase
    .schema("hris")
    .from("leave_types")
    .select("code")
    .eq("id", input.leave_type_id)
    .maybeSingle();

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "adjust_leave_credit",
    tableName: "leave_credits",
    recordId: input.employee_id,
    oldValues: { previous_total: currentTotal },
    newValues: {
      employee_id: input.employee_id,
      leave_type_id: input.leave_type_id,
      leave_type_code: lt?.code ?? null,
      year: input.year,
      adjustment: input.adjustment,
      new_total: newTotal,
      reason: input.reason,
    },
  });

  revalidatePath("/leaves/credits");
  revalidatePath(`/employees/${input.employee_id}`);
  return { success: true };
}

// ── Leave Applications ─────────────────────────────────────────────

export async function getLeaveApplications(): Promise<LeaveApplicationWithRelations[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("leave_applications")
    .select(`
      *,
      employees(
        first_name, last_name, department_id, biometric_no, employment_type, vl_sl_needs_manual_entry,
        departments!employees_department_id_fkey(name, code),
        positions(title),
        plantilla(position_title)
      ),
      leave_types(code, name)
    `)
    .order("created_at", { ascending: false });

  if (user.role === "employee") {
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("user_profile_id", user.id)
      .maybeSingle();
    if (!emp) return [];
    query = query.eq("employee_id", emp.id);
  } else if (isCompositeDeptAdminHead(user.role)) {
    // Composite Dept Admin + Head sees every leave application across all
    // departments — they act as a dept-head approver for the org.
  } else if (isDeptScoped(user.role)) {
    if (!user.departmentId) return [];
    const { data: deptEmps } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("department_id", user.departmentId);
    const ids = (deptEmps ?? []).map((e) => e.id);
    if (ids.length === 0) return [];
    query = query.in("employee_id", ids);
  }
  // super_admin, ocm_admin, and hr_admin fall through with no filter — they
  // see every leave application across all departments and at every approval
  // stage (including those still pending the department head's decision).

  const { data, error } = await query;
  if (error) throw error;
  return data as LeaveApplicationWithRelations[];
}

export async function getLeaveApplicationById(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("leave_applications")
    .select(`
      *,
      employees(
        first_name, last_name, middle_name, suffix, salary_grade, biometric_no, department_id, employment_type, vl_sl_needs_manual_entry,
        departments!employees_department_id_fkey(name, code),
        positions(title),
        plantilla(position_title)
      ),
      leave_types(code, name),
      created_by_profile:user_profiles!leave_applications_created_by_fkey(role)
    `)
    .eq("id", id)
    .single();
  if (error) throw error;

  if (
    isDeptScoped(user.role) &&
    !isCompositeDeptAdminHead(user.role) &&
    user.departmentId
  ) {
    const empDeptId =
      (data?.employees as { department_id?: string | null } | null)?.department_id ?? null;
    if (empDeptId !== user.departmentId) throw new Error("Not found");
  }

  return data as LeaveApplicationWithRelations;
}

export async function createLeaveApplication(input: {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_applied: number;
  reason: string | null;
  details_of_leave?: string | null;
  commutation_requested?: boolean;
  leave_dates?: string[];
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const year = new Date(input.start_date).getFullYear();

  // Composite Dept Admin + Head can file leave for any employee in any
  // department, so no dept-scoped restriction is applied below.
  if (
    isDeptHead(user.role) &&
    !isCompositeDeptAdminHead(user.role) &&
    user.departmentId
  ) {
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("department_id")
      .eq("id", input.employee_id)
      .maybeSingle();
    if (!emp || emp.department_id !== user.departmentId) {
      return { error: "Insufficient permissions" };
    }
  }

  // Department Admins can only file leave for plantilla employees in their own department.
  // (The composite dept_admin+head role takes the dept_head path above, which is broader.)
  if (user.role === "department_admin") {
    if (!user.departmentId) {
      return { error: "Department Admin must be assigned to a department" };
    }
    const { data: target } = await supabase
      .schema("hris")
      .from("employees")
      .select("department_id, employment_type")
      .eq("id", input.employee_id)
      .maybeSingle();
    if (!target) return { error: "Employee not found" };
    if (target.department_id !== user.departmentId) {
      return { error: "Department Admins can only file leave for employees in their department" };
    }
    if (target.employment_type !== "plantilla") {
      return { error: "Department Admins can only file leave for plantilla employees" };
    }
  }

  // Look up current balance to split the application into paid days vs LWOP.
  // We no longer reject when balance < days_applied; the excess is leave
  // without pay and won't deduct credits (see `days_with_pay` below).
  const { data: credit } = await supabase
    .schema("hris")
    .from("leave_credit_balances")
    .select("balance")
    .eq("employee_id", input.employee_id)
    .eq("leave_type_id", input.leave_type_id)
    .eq("year", year)
    .maybeSingle();

  const availableBalance = credit ? Math.max(0, Number(credit.balance)) : 0;
  const daysWithPay = Math.min(input.days_applied, availableBalance);

  // Check for overlapping approved/pending leave using specific dates
  const leaveDates = input.leave_dates ?? [];
  if (leaveDates.length > 0) {
    const { data: existingApps } = await supabase
      .schema("hris")
      .from("leave_applications")
      .select("leave_dates")
      .eq("employee_id", input.employee_id)
      .in("status", ["pending", "approved"])
      .lte("start_date", input.end_date)
      .gte("end_date", input.start_date);

    const existingDates = new Set(
      (existingApps ?? []).flatMap((a) => (a.leave_dates as string[]) ?? [])
    );
    const conflicting = leaveDates.filter((d) => existingDates.has(d));
    if (conflicting.length > 0) {
      return { error: `Leave dates overlap with an existing application (${conflicting[0]})` };
    }
  } else {
    // Fallback: range-based overlap check for apps without leave_dates
    const { data: overlapping } = await supabase
      .schema("hris")
      .from("leave_applications")
      .select("id")
      .eq("employee_id", input.employee_id)
      .in("status", ["pending", "approved"])
      .lte("start_date", input.end_date)
      .gte("end_date", input.start_date)
      .limit(1);
    if (overlapping && overlapping.length > 0) {
      return { error: "Leave dates overlap with an existing application" };
    }
  }

  // Validate maternity leave minimum days
  const { data: leaveType } = await supabase
    .schema("hris")
    .from("leave_types")
    .select("code")
    .eq("id", input.leave_type_id)
    .single();

  if (leaveType?.code === "ML" && input.days_applied < 60) {
    return { error: "Maternity leave requires a minimum of 60 days" };
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("leave_applications")
    .insert({ ...input, days_with_pay: daysWithPay, status: "pending", created_by: user.id })
    .select()
    .single();

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "create_leave",
    tableName: "leave_applications",
    recordId: data.id,
    newValues: {
      employee_id: input.employee_id,
      leave_type_id: input.leave_type_id,
      leave_type_code: leaveType?.code ?? null,
      start_date: input.start_date,
      end_date: input.end_date,
      days_applied: input.days_applied,
      days_with_pay: daysWithPay,
      days_without_pay: Math.max(0, input.days_applied - daysWithPay),
      commutation_requested: input.commutation_requested ?? false,
      reason: input.reason,
      filed_by_role: user.role,
    },
  });

  revalidatePath("/leaves");
  return { data };
}

export async function cancelLeaveApplication(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  // Only pending leaves can be cancelled.
  const { data: app } = await supabase
    .schema("hris")
    .from("leave_applications")
    .select(
      "employee_id, status, leave_type_id, start_date, end_date, days_applied, created_by, leave_types(code)"
    )
    .eq("id", id)
    .single();

  if (!app) return { error: "Application not found" };
  if (app.status !== "pending") return { error: "Only pending applications can be cancelled" };

  // A leave application can only be cancelled by the user who created/filed it.
  // `created_by` stores the filer's user_profiles id (set in
  // createLeaveApplication), so it matches `user.id` for the creator.
  if (app.created_by !== user.id) {
    return { error: "Only the creator can cancel this leave application" };
  }

  const { error } = await supabase
    .schema("hris")
    .from("leave_applications")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };

  const leaveTypeRel = app.leave_types as { code: string } | { code: string }[] | null;
  const leaveTypeCode = Array.isArray(leaveTypeRel)
    ? leaveTypeRel[0]?.code ?? null
    : leaveTypeRel?.code ?? null;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cancel_leave",
    tableName: "leave_applications",
    recordId: id,
    oldValues: { status: "pending" },
    newValues: {
      status: "cancelled",
      employee_id: app.employee_id,
      leave_type_id: app.leave_type_id,
      leave_type_code: leaveTypeCode,
      start_date: app.start_date,
      end_date: app.end_date,
      days_applied: app.days_applied,
      cancelled_by_role: user.role,
    },
  });

  revalidatePath("/leaves");
  revalidatePath(`/leaves/${id}`);
  revalidatePath(`/employees/${app.employee_id}`);
  return { success: true };
}

// Cancel an already-approved leave. Restricted to super_admin / hr_admin and
// requires a written reason for audit. The `leave_credit_balances` view
// derives used_credits from approved rows only, so flipping status to
// "cancelled" automatically refunds the deducted credits — no ledger
// adjustment needed. The cancellation reason is stored in `rejection_reason`
// (the same column reused for rejected leaves); the detail page distinguishes
// the two via the `status` field.
export async function cancelApprovedLeaveApplication(id: string, reason: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["super_admin", "hr_admin"].includes(user.role))
    return { error: "Only HR Admin or Super Admin can cancel an approved leave" };

  const trimmed = (reason ?? "").trim();
  if (!trimmed) return { error: "Cancellation reason is required" };

  const supabase = createAdminClient();

  const { data: app } = await supabase
    .schema("hris")
    .from("leave_applications")
    .select(
      "employee_id, status, leave_type_id, start_date, end_date, days_applied, days_with_pay, hr_approved_at, hr_reviewer_id, leave_types(code)"
    )
    .eq("id", id)
    .single();

  if (!app) return { error: "Application not found" };
  if (app.status !== "approved")
    return { error: "Only approved applications can be cancelled here" };

  const cancelledAt = new Date().toISOString();
  const { error } = await supabase
    .schema("hris")
    .from("leave_applications")
    .update({
      status: "cancelled",
      rejection_reason: trimmed,
      updated_at: cancelledAt,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  const leaveTypeRel = app.leave_types as { code: string } | { code: string }[] | null;
  const leaveTypeCode = Array.isArray(leaveTypeRel)
    ? leaveTypeRel[0]?.code ?? null
    : leaveTypeRel?.code ?? null;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cancel_approved_leave",
    tableName: "leave_applications",
    recordId: id,
    oldValues: {
      status: "approved",
      hr_approved_at: app.hr_approved_at,
      hr_reviewer_id: app.hr_reviewer_id,
    },
    newValues: {
      status: "cancelled",
      cancellation_reason: trimmed,
      cancelled_by: user.email,
      cancelled_by_role: user.role,
      employee_id: app.employee_id,
      leave_type_id: app.leave_type_id,
      leave_type_code: leaveTypeCode,
      start_date: app.start_date,
      end_date: app.end_date,
      days_applied: app.days_applied,
      days_with_pay_refunded: app.days_with_pay,
    },
  });

  revalidatePath("/leaves");
  revalidatePath(`/leaves/${id}`);
  revalidatePath("/leaves/credits");
  revalidatePath(`/employees/${app.employee_id}`);
  return { success: true, message: "Approved leave cancelled and credits refunded" };
}

// Super-admin-only override for an approved leave's paid-day split. Use case:
// a leave was approved at a time when the employee had insufficient (or zero)
// credits, so it was recorded as LWOP; credits were reconciled afterwards and
// HR now wants to charge the day(s) against those credits.
//
// Updating `days_with_pay` is sufficient — `leave_credit_balances` derives
// used_credits from SUM(approved.days_with_pay), so the ledger view and CSC
// Form 6 PDF (which reads `leave.days_with_pay`) both reflect the new split
// automatically.
export async function overrideApprovedLeaveDaysWithPay(
  id: string,
  newDaysWithPay: number,
  reason: string,
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "super_admin")
    return { error: "Only Super Admin can override paid days on an approved leave" };

  const trimmed = (reason ?? "").trim();
  if (!trimmed) return { error: "Reason is required" };
  if (!Number.isFinite(newDaysWithPay) || newDaysWithPay < 0)
    return { error: "Paid days must be a non-negative number" };

  const supabase = createAdminClient();

  const { data: app } = await supabase
    .schema("hris")
    .from("leave_applications")
    .select(
      "employee_id, leave_type_id, status, start_date, end_date, days_applied, days_with_pay, leave_types(code)"
    )
    .eq("id", id)
    .single();

  if (!app) return { error: "Application not found" };
  if (app.status !== "approved")
    return { error: "Only approved leaves can be overridden" };

  const daysApplied = Number(app.days_applied);
  if (newDaysWithPay > daysApplied)
    return { error: `Paid days cannot exceed days applied (${daysApplied})` };

  const oldDaysWithPay = Number(app.days_with_pay);
  if (newDaysWithPay === oldDaysWithPay)
    return { error: "Paid days are unchanged" };

  // Capacity check — the view subtracts this leave's current contribution from
  // balance, so we must add it back before deciding whether the new value
  // fits.
  const year = new Date(app.start_date).getFullYear();
  const { data: currentCredit } = await supabase
    .schema("hris")
    .from("leave_credit_balances")
    .select("balance")
    .eq("employee_id", app.employee_id)
    .eq("leave_type_id", app.leave_type_id)
    .eq("year", year)
    .maybeSingle();
  const currentBalance = currentCredit ? Number(currentCredit.balance) : 0;
  const availableCapacity = currentBalance + oldDaysWithPay;
  if (newDaysWithPay > availableCapacity)
    return {
      error: `Insufficient credits — only ${availableCapacity} day(s) available for this leave type.`,
    };

  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .schema("hris")
    .from("leave_applications")
    .update({ days_with_pay: newDaysWithPay, updated_at: updatedAt })
    .eq("id", id);
  if (error) return { error: error.message };

  const leaveTypeRel = app.leave_types as { code: string } | { code: string }[] | null;
  const leaveTypeCode = Array.isArray(leaveTypeRel)
    ? leaveTypeRel[0]?.code ?? null
    : leaveTypeRel?.code ?? null;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "override_leave_days_with_pay",
    tableName: "leave_applications",
    recordId: id,
    oldValues: { days_with_pay: oldDaysWithPay },
    newValues: {
      days_with_pay: newDaysWithPay,
      days_applied: daysApplied,
      reason: trimmed,
      overridden_by: user.email,
      employee_id: app.employee_id,
      leave_type_id: app.leave_type_id,
      leave_type_code: leaveTypeCode,
      start_date: app.start_date,
      end_date: app.end_date,
    },
  });

  revalidatePath("/leaves");
  revalidatePath(`/leaves/${id}`);
  revalidatePath("/leaves/credits");
  revalidatePath(`/employees/${app.employee_id}`);
  return { success: true, message: "Paid days updated" };
}

// ── Leave Approval Workflow (3-step) ───────────────────────────────
// 1. Employee submits → pending
// 2. Department Head approves → dept_approved_at set
// 3. HR approves → approved, credits deducted

export async function approveLeave(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  const { data: app } = await supabase
    .schema("hris")
    .from("leave_applications")
    .select("*, employees(department_id), leave_types(code)")
    .eq("id", id)
    .single();

  if (!app) return { error: "Application not found" };
  if (app.status !== "pending") return { error: "Application is not pending" };

  const leaveTypeRel = app.leave_types as { code: string } | { code: string }[] | null;
  const leaveTypeCode = Array.isArray(leaveTypeRel)
    ? leaveTypeRel[0]?.code ?? null
    : leaveTypeRel?.code ?? null;

  // Department Head approval step (Department Admin is view-only).
  // The composite Dept Admin + Head role and OCM Admin can approve at this
  // step for any department; a plain Dept Head is restricted to their own.
  // OCM Admin only acts here while dept-head approval is still outstanding —
  // once it's recorded, OCM Admin falls through to the HR step below.
  const actsAsDeptHead =
    isDeptHead(user.role) ||
    (user.role === "ocm_admin" && !app.dept_approved_at);
  if (actsAsDeptHead) {
    const canApproveAnyDept =
      isCompositeDeptAdminHead(user.role) || user.role === "ocm_admin";
    if (!canApproveAnyDept) {
      if (!user.departmentId) return { error: "User has no department assigned" };
      const empDeptId =
        (app.employees as { department_id?: string | null } | null)?.department_id ?? null;
      if (empDeptId !== user.departmentId)
        return { error: "Cannot approve leave outside your department" };
    }
    if (app.dept_approved_at) return { error: "Department-level approval already recorded" };

    const approvedAt = new Date().toISOString();
    const { error } = await supabase
      .schema("hris")
      .from("leave_applications")
      .update({
        department_head_id: user.id,
        dept_approved_at: approvedAt,
        updated_at: approvedAt,
      })
      .eq("id", id);

    if (error) return { error: error.message };

    await logAudit({
      userId: user.id,
      userEmail: user.email,
      action: "approve_leave_dept",
      tableName: "leave_applications",
      recordId: id,
      oldValues: { dept_approved_at: null, department_head_id: null },
      newValues: {
        dept_approved_at: approvedAt,
        department_head_id: user.id,
        dept_approved_by: user.email,
        role: user.role,
        employee_id: app.employee_id,
        leave_type_id: app.leave_type_id,
        leave_type_code: leaveTypeCode,
        start_date: app.start_date,
        end_date: app.end_date,
        days_applied: app.days_applied,
        days_with_pay: app.days_with_pay,
      },
    });

    revalidatePath(`/leaves/${id}`);
    revalidatePath("/leaves");
    revalidatePath(`/employees/${app.employee_id}`);
    return {
      success: true,
      message: "Department Head approval recorded",
    };
  }

  // HR / Super Admin / OCM Admin final approval. hr_admin and ocm_admin
  // require dept head approval first; super_admin can finalize directly.
  if (["hr_admin", "super_admin", "ocm_admin"].includes(user.role)) {
    if (
      (user.role === "hr_admin" || user.role === "ocm_admin") &&
      !app.dept_approved_at
    ) {
      return { error: "Department head must approve this leave first" };
    }

    // Recompute days_with_pay from the current credit balance. The view
    // excludes pending leaves, so the lookup balance represents what's
    // available before this application gets approved. This corrects stale
    // values when credits were seeded/imported after the leave was filed.
    const appYear = new Date(app.start_date).getFullYear();
    const { data: currentCredit } = await supabase
      .schema("hris")
      .from("leave_credit_balances")
      .select("balance")
      .eq("employee_id", app.employee_id)
      .eq("leave_type_id", app.leave_type_id)
      .eq("year", appYear)
      .maybeSingle();
    const availableBalance = currentCredit
      ? Math.max(0, Number(currentCredit.balance))
      : 0;
    const newDaysWithPay = Math.min(Number(app.days_applied), availableBalance);

    const approvedAt = new Date().toISOString();
    const { error } = await supabase
      .schema("hris")
      .from("leave_applications")
      .update({
        status: "approved",
        days_with_pay: newDaysWithPay,
        hr_reviewer_id: user.id,
        hr_approved_at: approvedAt,
        updated_at: approvedAt,
      })
      .eq("id", id);

    if (error) return { error: error.message };

    // No need to mutate used_credits: the leave_credit_balances view derives
    // used = SUM(approved leave_applications.days_with_pay) for the year.

    await logAudit({
      userId: user.id,
      userEmail: user.email,
      action: "approve_leave",
      tableName: "leave_applications",
      recordId: id,
      oldValues: {
        status: "pending",
        hr_approved_at: null,
        hr_reviewer_id: null,
        days_with_pay: app.days_with_pay,
      },
      newValues: {
        status: "approved",
        hr_approved_at: approvedAt,
        hr_reviewer_id: user.id,
        approved_by: user.email,
        role: user.role,
        employee_id: app.employee_id,
        leave_type_id: app.leave_type_id,
        leave_type_code: leaveTypeCode,
        start_date: app.start_date,
        end_date: app.end_date,
        days_applied: app.days_applied,
        days_with_pay: newDaysWithPay,
        dept_approved_at: app.dept_approved_at,
        dept_approved_by_id: app.department_head_id,
      },
    });

    revalidatePath(`/leaves/${id}`);
    revalidatePath("/leaves");
    revalidatePath("/leaves/credits");
    revalidatePath(`/employees/${app.employee_id}`);
    return { success: true, message: "Leave application approved and credits deducted" };
  }

  return { error: "Insufficient permissions" };
}

export async function rejectLeave(id: string, reason: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (
    !["hr_admin", "super_admin", "ocm_admin"].includes(user.role) &&
    !isDeptHead(user.role)
  )
    return { error: "Insufficient permissions" };

  const supabase = createAdminClient();

  const { data: app } = await supabase
    .schema("hris")
    .from("leave_applications")
    .select("dept_approved_at, employee_id, leave_type_id, start_date, end_date, days_applied, days_with_pay, employees(department_id), leave_types(code)")
    .eq("id", id)
    .maybeSingle();
  if (!app) return { error: "Application not found" };

  // Department head can only reject leaves for their own department.
  // The composite Dept Admin + Head role and OCM Admin are exempt and can
  // reject across all departments (OCM Admin is not a Dept Head, so it skips
  // this block entirely).
  if (isDeptHead(user.role) && !isCompositeDeptAdminHead(user.role)) {
    if (!user.departmentId) return { error: "User has no department assigned" };
    const empDeptId =
      (app.employees as { department_id?: string | null } | null)?.department_id ?? null;
    if (empDeptId !== user.departmentId)
      return { error: "Cannot reject leave outside your department" };
  }

  // HR can only reject leaves the department head has already approved
  if (user.role === "hr_admin" && !app.dept_approved_at) {
    return { error: "Department head must approve this leave first" };
  }

  // OCM Admin rejects as Dept Head while dept approval is outstanding, then as
  // HR once it's recorded — mirroring its approval behaviour.
  const isRejectingAsDeptHead =
    isDeptHead(user.role) ||
    (user.role === "ocm_admin" && !app.dept_approved_at);

  const { error } = await supabase
    .schema("hris")
    .from("leave_applications")
    .update({
      status: "rejected",
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
      ...(isRejectingAsDeptHead
        ? { department_head_id: user.id }
        : { hr_reviewer_id: user.id }),
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) return { error: error.message };

  const leaveTypeRel = app.leave_types as { code: string } | { code: string }[] | null;
  const leaveTypeCode = Array.isArray(leaveTypeRel)
    ? leaveTypeRel[0]?.code ?? null
    : leaveTypeRel?.code ?? null;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: isRejectingAsDeptHead ? "reject_leave_dept" : "reject_leave",
    tableName: "leave_applications",
    recordId: id,
    oldValues: { status: "pending" },
    newValues: {
      status: "rejected",
      rejection_reason: reason,
      rejected_by: user.email,
      rejected_by_role: user.role,
      employee_id: app.employee_id,
      leave_type_id: app.leave_type_id,
      leave_type_code: leaveTypeCode,
      start_date: app.start_date,
      end_date: app.end_date,
      days_applied: app.days_applied,
      days_with_pay: app.days_with_pay,
    },
  });

  revalidatePath(`/leaves/${id}`);
  revalidatePath("/leaves");
  revalidatePath(`/employees/${app.employee_id}`);
  return { success: true };
}

// ── Leave Ledger ───────────────────────────────────────────────────

export interface LeaveLedgerEntry {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_applied: number;
  days_with_pay: number;
  status: string;
  created_at: string;
  leave_types: { code: string; name: string } | null;
}

export async function getLeaveLedger(employeeId: string, year: number) {
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  // Department-scoped users can only read ledger for employees in their own
  // department; the composite Dept Admin + Head is exempt.
  if (
    user &&
    isDeptScoped(user.role) &&
    !isCompositeDeptAdminHead(user.role)
  ) {
    if (!user.departmentId) return [];
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("department_id")
      .eq("id", employeeId)
      .maybeSingle();
    if (!emp || emp.department_id !== user.departmentId) return [];
  }

  const startOfYear = `${year}-01-01`;
  const endOfYear = `${year}-12-31`;

  const { data, error } = await supabase
    .schema("hris")
    .from("leave_applications")
    .select("id, employee_id, leave_type_id, start_date, end_date, days_applied, days_with_pay, status, created_at, leave_types(code, name)")
    .eq("employee_id", employeeId)
    .gte("start_date", startOfYear)
    .lte("start_date", endOfYear)
    .order("start_date");

  if (error) throw error;
  // Supabase may return joined relations as arrays — normalize
  return (data ?? []).map((d) => ({
    ...d,
    leave_types: Array.isArray(d.leave_types) ? d.leave_types[0] ?? null : d.leave_types,
  })) as LeaveLedgerEntry[];
}

// ── Manual Credit Adjustments (ledger view) ────────────────────────

export interface LeaveCreditAdjustmentEntry {
  id: string;
  amount: number;
  notes: string | null;
  created_at: string;
  leave_types: { code: string; name: string } | null;
  created_by_name: string | null;
}

export async function getLeaveCreditAdjustments(
  employeeId: string,
  year: number,
): Promise<LeaveCreditAdjustmentEntry[]> {
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  if (
    user &&
    isDeptScoped(user.role) &&
    !isCompositeDeptAdminHead(user.role)
  ) {
    if (!user.departmentId) return [];
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("department_id")
      .eq("id", employeeId)
      .maybeSingle();
    if (!emp || emp.department_id !== user.departmentId) return [];
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("leave_credit_accruals")
    .select(
      "id, amount, notes, created_at, leave_types(code, name), creator:user_profiles!leave_credit_accruals_created_by_fkey(full_name)",
    )
    .eq("employee_id", employeeId)
    .eq("year", year)
    .eq("source", "adjustment")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((d) => {
    const lt = Array.isArray(d.leave_types)
      ? d.leave_types[0] ?? null
      : d.leave_types;
    const creator = Array.isArray(d.creator) ? d.creator[0] ?? null : d.creator;
    return {
      id: d.id,
      amount: Number(d.amount),
      notes: d.notes,
      created_at: d.created_at,
      leave_types: lt,
      created_by_name: creator?.full_name ?? null,
    };
  });
}

// ── Monthly Accrual History (ledger view) ─────────────────────────

export interface LeaveAccrualHistoryEntry {
  id: string;
  year: number;
  month: number | null;
  amount: number;
  source: string;
  notes: string | null;
  created_at: string;
  leave_types: { code: string; name: string } | null;
}

export async function getLeaveAccrualHistory(
  employeeId: string,
  year: number,
): Promise<LeaveAccrualHistoryEntry[]> {
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  if (
    user &&
    isDeptScoped(user.role) &&
    !isCompositeDeptAdminHead(user.role)
  ) {
    if (!user.departmentId) return [];
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("department_id")
      .eq("id", employeeId)
      .maybeSingle();
    if (!emp || emp.department_id !== user.departmentId) return [];
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("leave_credit_accruals")
    .select("id, year, month, amount, source, notes, created_at, leave_types(code, name)")
    .eq("employee_id", employeeId)
    .eq("year", year)
    .in("source", ["monthly_accrual", "carryover", "seed", "csv_import"])
    .order("month", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((d) => {
    const lt = Array.isArray(d.leave_types) ? d.leave_types[0] ?? null : d.leave_types;
    return {
      id: d.id,
      year: d.year,
      month: d.month,
      amount: Number(d.amount),
      source: d.source,
      notes: d.notes,
      created_at: d.created_at,
      leave_types: lt,
    };
  });
}

// ── Leave Balances Report (all active plantilla employees) ─────────

export interface LeaveBalanceReportColumn {
  code: string;
  name: string;
}

export interface LeaveBalanceReportRow {
  employee_id: string;
  full_name: string;
  department: string;
  balances: Record<string, number>;
}

export interface LeaveBalanceReport {
  year: number;
  columns: LeaveBalanceReportColumn[];
  rows: LeaveBalanceReportRow[];
}

/**
 * Leave-credit balances for every active plantilla employee, pivoted so each
 * leave type (VL, SL, SPL, …) is a column. Used by the Leave Balances report
 * for an Excel/CSV download. Balances come from the `leave_credit_balances`
 * view (balance = total_credits − used_credits). Restricted to HR/super admin.
 */
export async function getLeaveBalancesReport(
  year: number,
): Promise<LeaveBalanceReport> {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    return { year, columns: [], rows: [] };
  }

  const supabase = createAdminClient();

  // Leave types become the pivoted columns. VL and SL lead (the accruing
  // cumulative types HR cares about most); the rest follow alphabetically.
  const { data: leaveTypes, error: ltError } = await supabase
    .schema("hris")
    .from("leave_types")
    .select("id, code, name");
  if (ltError) throw ltError;

  const rank = (code: string) =>
    code === "VL" ? 0 : code === "SL" ? 1 : 2;
  const sortedTypes = [...(leaveTypes ?? [])].sort(
    (a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code),
  );
  const codeById = new Map(sortedTypes.map((lt) => [lt.id, lt.code]));
  const columns: LeaveBalanceReportColumn[] = sortedTypes.map((lt) => ({
    code: lt.code,
    name: lt.name,
  }));

  // Active plantilla employees only.
  const { data: employees, error: empError } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, first_name, middle_name, last_name, suffix, departments!employees_department_id_fkey(name)",
    )
    .eq("status", "active")
    .eq("employment_type", "plantilla");
  if (empError) throw empError;

  const empList = employees ?? [];
  const empIds = empList.map((e) => e.id);

  // Balances for the year for just these employees.
  const balanceByEmp = new Map<string, Record<string, number>>();
  if (empIds.length > 0) {
    const { data: balances, error: balError } = await supabase
      .schema("hris")
      .from("leave_credit_balances")
      .select("employee_id, leave_type_id, balance")
      .eq("year", year)
      .in("employee_id", empIds);
    if (balError) throw balError;

    for (const b of balances ?? []) {
      const code = codeById.get(b.leave_type_id);
      if (!code) continue;
      const rec = balanceByEmp.get(b.employee_id) ?? {};
      rec[code] = Number(b.balance) || 0;
      balanceByEmp.set(b.employee_id, rec);
    }
  }

  const rows: LeaveBalanceReportRow[] = empList
    .map((e) => {
      const dept = Array.isArray(e.departments)
        ? e.departments[0]
        : e.departments;
      const balances: Record<string, number> = {};
      const empBalances = balanceByEmp.get(e.id) ?? {};
      for (const col of columns) {
        balances[col.code] = empBalances[col.code] ?? 0;
      }
      return {
        employee_id: e.id,
        full_name: formatEmployeeDisplayName(e),
        department: (dept as { name?: string } | null)?.name ?? "—",
        balances,
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return { year, columns, rows };
}

// ── Bulk Provisioning ──────────────────────────────────────────────

export async function flagAllEmployeesNeedingVlSlEntry() {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "super_admin")
    return { error: "Insufficient permissions" };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .update({ vl_sl_needs_manual_entry: true })
    .eq("status", "active")
    .select("id");

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "flag_all_vl_sl_manual_entry",
    tableName: "employees",
    newValues: { flagged: data?.length ?? 0 },
  });

  revalidatePath("/leaves/credits");
  revalidatePath("/employees");
  return { success: true, flagged: data?.length ?? 0 };
}

export async function provisionAllActiveEmployees(year: number) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["super_admin", "hr_admin"].includes(user.role))
    return { error: "Insufficient permissions" };

  const supabase = createAdminClient();
  const { data: employees } = await supabase
    .schema("hris")
    .from("employees")
    .select("id")
    .eq("status", "active");

  if (!employees) return { error: "No active employees found" };

  let provisioned = 0;
  for (const emp of employees) {
    const result = await provisionLeaveCredits(emp.id, year);
    if (result.success) provisioned += result.provisioned ?? 0;
  }

  revalidatePath("/leaves/credits");
  return { success: true, provisioned };
}

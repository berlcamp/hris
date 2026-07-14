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
import type { UserRole } from "@/lib/types";
import {
  computeCtoBalance,
  computeEarnClamp,
  ctoMonthKey,
  manilaToday,
  CTO_MULTIPLIERS,
  CTO_MONTHLY_EARN_CAP,
  CTO_MAX_BALANCE,
  type CtoBalanceResult,
  type CtoDayType,
  type CtoEarnLite,
  type CtoUsageLite,
} from "@/lib/cto-helpers";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

// A CTO application filed by an OCM Admin is "owned" by that OCM Admin: no
// other user may approve, reject, or cancel it. Mirrors the identical rule in
// leave-actions.ts.
function normalizeCreatorRole(
  rel: { role: string } | { role: string }[] | null | undefined
): string | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0]?.role ?? null : rel.role ?? null;
}

function ocmAdminRestrictionError(
  app: {
    created_by?: string | null;
    created_by_profile?: { role: string } | { role: string }[] | null;
  },
  user: { id: string }
): string | null {
  const creatorRole = normalizeCreatorRole(app.created_by_profile);
  if (creatorRole === "ocm_admin" && app.created_by && app.created_by !== user.id) {
    return "This CTO was filed by an OCM Admin and can only be approved or cancelled by that OCM Admin.";
  }
  return null;
}

export interface CtoCreditWithRelations {
  id: string;
  employee_id: string;
  ot_date: string;
  day_type: CtoDayType;
  hours_worked: number;
  multiplier: number;
  hours_earned: number;
  expiry_date: string;
  office_order_no: string | null;
  notes: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
  employees: {
    first_name: string;
    last_name: string;
    middle_name: string | null;
    suffix: string | null;
    biometric_no: number;
    department_id: string | null;
    departments: { name: string; code: string } | null;
  } | null;
}

export interface CtoApplicationWithRelations {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  cto_dates: string[];
  hours_applied: number;
  reason: string | null;
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
    biometric_no: number;
    department_id: string | null;
    employment_type: string;
    departments: { name: string; code: string } | null;
    positions: { title: string } | null;
    plantilla: { position_title: string | null }[] | null;
  } | null;
  created_by_profile: { role: string } | null;
}

// ── Shared fetch helpers ───────────────────────────────────────────

async function fetchEarnsAndUsages(
  supabase: SupabaseAdmin,
  employeeId: string
): Promise<{ earns: CtoEarnLite[]; usages: CtoUsageLite[]; error: string | null }> {
  const [{ data: earns, error: earnErr }, { data: usages, error: usageErr }] =
    await Promise.all([
      supabase
        .schema("hris")
        .from("cto_credits")
        .select("id, ot_date, expiry_date, hours_earned, created_at")
        .eq("employee_id", employeeId)
        .is("voided_at", null),
      supabase
        .schema("hris")
        .from("cto_applications")
        .select("id, start_date, hours_applied, created_at")
        .eq("employee_id", employeeId)
        .eq("status", "approved"),
    ]);
  if (earnErr || usageErr) {
    return { earns: [], usages: [], error: (earnErr ?? usageErr)!.message };
  }
  return {
    earns: (earns ?? []) as CtoEarnLite[],
    usages: (usages ?? []) as CtoUsageLite[],
    error: null,
  };
}

// Department-scoped users may only touch employees in their own department;
// the composite Dept Admin + Head role is exempt (same as the Leave module).
async function deptScopeAllows(
  supabase: SupabaseAdmin,
  user: { role: UserRole; departmentId: string | null },
  employeeId: string
): Promise<boolean> {
  if (!isDeptScoped(user.role) || isCompositeDeptAdminHead(user.role)) {
    return true;
  }
  if (!user.departmentId) return false;
  const { data: emp } = await supabase
    .schema("hris")
    .from("employees")
    .select("department_id")
    .eq("id", employeeId)
    .maybeSingle();
  return !!emp && emp.department_id === user.departmentId;
}

// ── COC Credits (earn ledger) ──────────────────────────────────────

export async function getCtoCredits(
  employeeId?: string
): Promise<CtoCreditWithRelations[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("cto_credits")
    .select(`
      *,
      employees(
        first_name, last_name, middle_name, suffix, biometric_no, department_id,
        departments!employees_department_id_fkey(name, code)
      )
    `)
    .order("ot_date", { ascending: false });

  if (employeeId) query = query.eq("employee_id", employeeId);

  if (user.role === "employee") {
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
    !isCompositeDeptAdminHead(user.role)
  ) {
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

  const { data, error } = await query;
  if (error) throw error;
  return data as CtoCreditWithRelations[];
}

export async function getCtoBalance(
  employeeId: string
): Promise<CtoBalanceResult | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  if (user.role === "employee") {
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("user_profile_id", user.id)
      .maybeSingle();
    if (!emp || emp.id !== employeeId) return { error: "Not found" };
  } else if (!(await deptScopeAllows(supabase, user, employeeId))) {
    return { error: "Not found" };
  }

  const { earns, usages, error } = await fetchEarnsAndUsages(supabase, employeeId);
  if (error) return { error };
  return computeCtoBalance(earns, usages, manilaToday());
}

export async function createCtoCredit(input: {
  employee_id: string;
  ot_date: string;
  day_type: CtoDayType;
  hours_worked: number;
  office_order_no?: string | null;
  notes?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["super_admin", "hr_admin"].includes(user.role))
    return { error: "Insufficient permissions" };

  if (!Number.isFinite(input.hours_worked) || input.hours_worked <= 0)
    return { error: "Hours worked must be greater than 0" };
  if (input.hours_worked > 24)
    return { error: "Hours worked cannot exceed 24" };
  if (!(input.day_type in CTO_MULTIPLIERS))
    return { error: "Invalid day type" };

  const today = manilaToday();
  if (input.ot_date > today)
    return { error: "Overtime date cannot be in the future" };

  const supabase = createAdminClient();

  const { earns, usages, error: fetchError } = await fetchEarnsAndUsages(
    supabase,
    input.employee_id
  );
  if (fetchError) return { error: fetchError };

  // 40h/month cap counts hours earned within the same calendar month as the
  // OT date; the 120h cap applies to the current unexpired balance.
  const monthKey = ctoMonthKey(input.ot_date);
  const monthEarnedSoFar = earns
    .filter((e) => ctoMonthKey(e.ot_date) === monthKey)
    .reduce((acc, e) => acc + Number(e.hours_earned), 0);
  const { available } = computeCtoBalance(earns, usages, today);

  const { rawEarned, storedEarned, clampedBy } = computeEarnClamp({
    hoursWorked: input.hours_worked,
    dayType: input.day_type,
    monthEarnedSoFar,
    availableNow: available,
  });

  if (storedEarned <= 0) {
    if (clampedBy.includes("monthly_cap"))
      return {
        error: `The employee has already earned the ${CTO_MONTHLY_EARN_CAP}h monthly COC cap for ${monthKey} (CSC-DBM JC No. 2, s. 2004).`,
      };
    return {
      error: `The employee is already at the ${CTO_MAX_BALANCE}h maximum COC balance (CSC-DBM JC No. 2, s. 2004).`,
    };
  }

  let notes = input.notes?.trim() || null;
  if (storedEarned < rawEarned) {
    const capNote = `Clamped from ${rawEarned}h: ${CTO_MONTHLY_EARN_CAP}h/month and ${CTO_MAX_BALANCE}h balance caps (CSC-DBM JC No. 2, s. 2004). Excess forfeited.`;
    notes = notes ? `${notes} — ${capNote}` : capNote;
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("cto_credits")
    .insert({
      employee_id: input.employee_id,
      ot_date: input.ot_date,
      day_type: input.day_type,
      hours_worked: input.hours_worked,
      multiplier: CTO_MULTIPLIERS[input.day_type],
      hours_earned: storedEarned,
      office_order_no: input.office_order_no?.trim() || null,
      notes,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "create_cto_credit",
    tableName: "cto_credits",
    recordId: data.id,
    newValues: {
      employee_id: input.employee_id,
      ot_date: input.ot_date,
      day_type: input.day_type,
      hours_worked: input.hours_worked,
      multiplier: CTO_MULTIPLIERS[input.day_type],
      raw_earned: rawEarned,
      hours_earned: storedEarned,
      clamped_by: clampedBy,
      office_order_no: input.office_order_no ?? null,
      notes,
    },
  });

  revalidatePath("/cto/credits");
  revalidatePath(`/cto/credits/${input.employee_id}`);
  return { data, storedEarned, rawEarned, clampedBy };
}

// Live preview for the COC entry dialog: what would be stored (after the
// 40h/month and 120h caps) if this entry were saved now. Read-only.
export async function previewCtoCreditClamp(input: {
  employee_id: string;
  ot_date: string;
  day_type: CtoDayType;
  hours_worked: number;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["super_admin", "hr_admin"].includes(user.role))
    return { error: "Insufficient permissions" };
  if (!Number.isFinite(input.hours_worked) || input.hours_worked <= 0)
    return { error: "Invalid hours" };

  const supabase = createAdminClient();
  const { earns, usages, error } = await fetchEarnsAndUsages(
    supabase,
    input.employee_id
  );
  if (error) return { error };

  const monthKey = ctoMonthKey(input.ot_date);
  const monthEarnedSoFar = earns
    .filter((e) => ctoMonthKey(e.ot_date) === monthKey)
    .reduce((acc, e) => acc + Number(e.hours_earned), 0);
  const { available } = computeCtoBalance(earns, usages, manilaToday());

  return {
    ...computeEarnClamp({
      hoursWorked: input.hours_worked,
      dayType: input.day_type,
      monthEarnedSoFar,
      availableNow: available,
    }),
    monthEarnedSoFar,
    available,
  };
}

export async function voidCtoCredit(id: string, reason: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["super_admin", "hr_admin"].includes(user.role))
    return { error: "Insufficient permissions" };

  const trimmed = (reason ?? "").trim();
  if (!trimmed) return { error: "Void reason is required" };

  const supabase = createAdminClient();

  const { data: credit } = await supabase
    .schema("hris")
    .from("cto_credits")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!credit) return { error: "COC entry not found" };
  if (credit.voided_at) return { error: "This COC entry is already voided" };

  // Block the void if approved applications have already consumed these
  // credits — re-run FIFO without this earn and check for shortfalls.
  const { earns, usages, error: fetchError } = await fetchEarnsAndUsages(
    supabase,
    credit.employee_id
  );
  if (fetchError) return { error: fetchError };

  const remainingEarns = earns.filter((e) => e.id !== id);
  const { shortfalls } = computeCtoBalance(remainingEarns, usages, manilaToday());
  if (shortfalls.length > 0) {
    return {
      error: `Cannot void: ${shortfalls.length} approved CTO application(s) already consumed these credits. Cancel those applications first.`,
    };
  }

  const voidedAt = new Date().toISOString();
  const { error } = await supabase
    .schema("hris")
    .from("cto_credits")
    .update({ voided_at: voidedAt, voided_by: user.id, void_reason: trimmed })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "void_cto_credit",
    tableName: "cto_credits",
    recordId: id,
    oldValues: {
      voided_at: null,
      hours_earned: credit.hours_earned,
      ot_date: credit.ot_date,
    },
    newValues: {
      voided_at: voidedAt,
      voided_by: user.email,
      void_reason: trimmed,
      employee_id: credit.employee_id,
    },
  });

  revalidatePath("/cto/credits");
  revalidatePath(`/cto/credits/${credit.employee_id}`);
  return { success: true };
}

// ── CTO Applications ───────────────────────────────────────────────

export async function getCtoApplications(): Promise<CtoApplicationWithRelations[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("cto_applications")
    .select(`
      *,
      employees(
        first_name, last_name, middle_name, suffix, biometric_no, department_id, employment_type,
        departments!employees_department_id_fkey(name, code),
        positions(title),
        plantilla(position_title)
      ),
      created_by_profile:user_profiles!cto_applications_created_by_fkey(role)
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
    // Composite Dept Admin + Head sees every CTO application (mirrors Leave).
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
  // super_admin, ocm_admin, and hr_admin see everything.

  const { data, error } = await query;
  if (error) throw error;
  return data as CtoApplicationWithRelations[];
}

export async function getCtoApplicationById(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("cto_applications")
    .select(`
      *,
      employees(
        first_name, last_name, middle_name, suffix, biometric_no, department_id, employment_type,
        departments!employees_department_id_fkey(name, code),
        positions(title),
        plantilla(position_title)
      ),
      created_by_profile:user_profiles!cto_applications_created_by_fkey(role)
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

  return data as CtoApplicationWithRelations;
}

export async function createCtoApplication(input: {
  employee_id: string;
  start_date: string;
  end_date: string;
  cto_dates: string[];
  hours_applied: number;
  reason: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  // Same filing permissions as leave applications: a plain Dept Head files
  // only for their own department; a Department Admin only for plantilla
  // employees in their department; the composite role is unrestricted.
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
      return { error: "Department Admins can only file CTO for employees in their department" };
    }
    if (target.employment_type !== "plantilla") {
      return { error: "Department Admins can only file CTO for plantilla employees" };
    }
  }

  if (user.role === "employee") {
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("user_profile_id", user.id)
      .maybeSingle();
    if (!emp || emp.id !== input.employee_id) {
      return { error: "You can only file CTO for yourself" };
    }
  }

  // ── CSC availment rules (JC No. 2, s. 2004) ──
  const hours = Number(input.hours_applied);
  if (!Number.isFinite(hours) || hours < 4 || hours > 40 || hours % 4 !== 0) {
    return { error: "CTO must be availed in 4-hour blocks (4 to 40 hours)" };
  }

  const dates = [...(input.cto_dates ?? [])].sort();
  if (dates.length === 0) return { error: "No working days in the selected range" };
  if (dates.length > 5) {
    return { error: "CTO may be availed for at most 5 consecutive working days per application" };
  }
  if (hours > 8 * dates.length || hours <= 8 * (dates.length - 1)) {
    return { error: "Hours applied do not match the number of working days" };
  }
  if (dates[0] < input.start_date || dates[dates.length - 1] > input.end_date) {
    return { error: "CTO dates must fall within the selected range" };
  }

  // Server-side re-validation that every availed date is a working day.
  for (const d of dates) {
    const [y, m, day] = d.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (dow === 0 || dow === 6) {
      return { error: `${d} falls on a weekend and cannot be availed as CTO` };
    }
  }
  const { data: holidayHits } = await supabase
    .schema("hris")
    .from("holidays")
    .select("date")
    .eq("type", "full")
    .in("date", dates);
  if (holidayHits && holidayHits.length > 0) {
    return { error: `${holidayHits[0].date} is a holiday and cannot be availed as CTO` };
  }

  // Overlap check against existing pending/approved CTO applications.
  const { data: existingApps } = await supabase
    .schema("hris")
    .from("cto_applications")
    .select("cto_dates")
    .eq("employee_id", input.employee_id)
    .in("status", ["pending", "approved"])
    .lte("start_date", input.end_date)
    .gte("end_date", input.start_date);
  const existingDates = new Set(
    (existingApps ?? []).flatMap((a) => (a.cto_dates as string[]) ?? [])
  );
  const conflicting = dates.filter((d) => existingDates.has(d));
  if (conflicting.length > 0) {
    return { error: `CTO dates overlap with an existing application (${conflicting[0]})` };
  }

  // Hard balance check — COC has no "without pay" fallback. Available balance
  // is computed as of the start date so credits expiring before the availment
  // are correctly excluded (FIFO, 1-year validity).
  const { earns, usages, error: fetchError } = await fetchEarnsAndUsages(
    supabase,
    input.employee_id
  );
  if (fetchError) return { error: fetchError };
  const { available } = computeCtoBalance(earns, usages, input.start_date);
  if (hours > available) {
    return {
      error: `Insufficient COC balance: this application needs ${hours}h but only ${available}h will be unexpired as of ${input.start_date}.`,
    };
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("cto_applications")
    .insert({
      employee_id: input.employee_id,
      start_date: input.start_date,
      end_date: input.end_date,
      cto_dates: dates,
      hours_applied: hours,
      reason: input.reason?.trim() || null,
      status: "pending",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "create_cto",
    tableName: "cto_applications",
    recordId: data.id,
    newValues: {
      employee_id: input.employee_id,
      start_date: input.start_date,
      end_date: input.end_date,
      cto_dates: dates,
      hours_applied: hours,
      reason: input.reason,
      filed_by_role: user.role,
    },
  });

  revalidatePath("/cto");
  return { data };
}

export async function cancelCtoApplication(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  const { data: app } = await supabase
    .schema("hris")
    .from("cto_applications")
    .select("employee_id, status, start_date, end_date, hours_applied, created_by")
    .eq("id", id)
    .single();

  if (!app) return { error: "Application not found" };
  if (app.status !== "pending")
    return { error: "Only pending applications can be cancelled" };
  if (app.created_by !== user.id) {
    return { error: "Only the creator can cancel this CTO application" };
  }

  const { error } = await supabase
    .schema("hris")
    .from("cto_applications")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cancel_cto",
    tableName: "cto_applications",
    recordId: id,
    oldValues: { status: "pending" },
    newValues: {
      status: "cancelled",
      employee_id: app.employee_id,
      start_date: app.start_date,
      end_date: app.end_date,
      hours_applied: app.hours_applied,
      cancelled_by_role: user.role,
    },
  });

  revalidatePath("/cto");
  revalidatePath(`/cto/${id}`);
  return { success: true };
}

// Cancel an already-approved CTO. The FIFO balance is computed from approved
// applications only, so flipping the status automatically restores the
// consumed credits (which correctly re-expire if now past their expiry date).
export async function cancelApprovedCtoApplication(id: string, reason: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const trimmed = (reason ?? "").trim();
  if (!trimmed) return { error: "Cancellation reason is required" };

  const supabase = createAdminClient();

  const { data: app } = await supabase
    .schema("hris")
    .from("cto_applications")
    .select(
      "employee_id, status, start_date, end_date, hours_applied, hr_approved_at, hr_reviewer_id, created_by, created_by_profile:user_profiles!cto_applications_created_by_fkey(role)"
    )
    .eq("id", id)
    .single();

  if (!app) return { error: "Application not found" };
  if (app.status !== "approved")
    return { error: "Only approved applications can be cancelled here" };

  const cancelRestriction = ocmAdminRestrictionError(app, user);
  if (cancelRestriction) return { error: cancelRestriction };
  const isOcmOwned = normalizeCreatorRole(app.created_by_profile) === "ocm_admin";
  if (!isOcmOwned && !["super_admin", "hr_admin"].includes(user.role))
    return { error: "Only HR Admin or Super Admin can cancel an approved CTO" };

  const cancelledAt = new Date().toISOString();
  const { error } = await supabase
    .schema("hris")
    .from("cto_applications")
    .update({
      status: "cancelled",
      rejection_reason: trimmed,
      updated_at: cancelledAt,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cancel_approved_cto",
    tableName: "cto_applications",
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
      start_date: app.start_date,
      end_date: app.end_date,
      hours_restored: app.hours_applied,
    },
  });

  revalidatePath("/cto");
  revalidatePath(`/cto/${id}`);
  revalidatePath("/cto/credits");
  revalidatePath(`/cto/credits/${app.employee_id}`);
  return { success: true, message: "Approved CTO cancelled and COC hours restored" };
}

// ── CTO Approval Workflow (two-stage, mirrors approveLeave) ────────
// 1. Employee/filer submits → pending
// 2. Department Head approves → dept_approved_at set
// 3. HR approves → approved (COC hours consumed via compute-on-read FIFO)

export async function approveCto(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  const { data: app } = await supabase
    .schema("hris")
    .from("cto_applications")
    .select(
      "*, employees(department_id), created_by_profile:user_profiles!cto_applications_created_by_fkey(role)"
    )
    .eq("id", id)
    .single();

  if (!app) return { error: "Application not found" };
  if (app.status !== "pending") return { error: "Application is not pending" };

  const approveRestriction = ocmAdminRestrictionError(app, user);
  if (approveRestriction) return { error: approveRestriction };

  // Department Head approval step. Composite Dept Admin + Head and OCM Admin
  // can approve for any department; a plain Dept Head only for their own.
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
        return { error: "Cannot approve CTO outside your department" };
    }
    if (app.dept_approved_at)
      return { error: "Department-level approval already recorded" };

    const approvedAt = new Date().toISOString();
    const { error } = await supabase
      .schema("hris")
      .from("cto_applications")
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
      action: "approve_cto_dept",
      tableName: "cto_applications",
      recordId: id,
      oldValues: { dept_approved_at: null, department_head_id: null },
      newValues: {
        dept_approved_at: approvedAt,
        department_head_id: user.id,
        dept_approved_by: user.email,
        role: user.role,
        employee_id: app.employee_id,
        start_date: app.start_date,
        end_date: app.end_date,
        hours_applied: app.hours_applied,
      },
    });

    revalidatePath(`/cto/${id}`);
    revalidatePath("/cto");
    return { success: true, message: "Department Head approval recorded" };
  }

  // HR / Super Admin / OCM Admin final approval. hr_admin and ocm_admin
  // require dept head approval first; super_admin can finalize directly.
  if (["hr_admin", "super_admin", "ocm_admin"].includes(user.role)) {
    if (
      (user.role === "hr_admin" || user.role === "ocm_admin") &&
      !app.dept_approved_at
    ) {
      return { error: "Department head must approve this CTO first" };
    }

    // Re-check the COC balance right before approval — a void or an earlier
    // approval may have shrunk it since filing. Hard reject, no partial pay.
    const { earns, usages, error: fetchError } = await fetchEarnsAndUsages(
      supabase,
      app.employee_id
    );
    if (fetchError) return { error: fetchError };
    const { available } = computeCtoBalance(earns, usages, app.start_date);
    const hours = Number(app.hours_applied);
    if (hours > available) {
      return {
        error: `Insufficient COC balance: this application needs ${hours}h but only ${available}h is unexpired as of ${app.start_date}.`,
      };
    }

    const approvedAt = new Date().toISOString();
    const { error } = await supabase
      .schema("hris")
      .from("cto_applications")
      .update({
        status: "approved",
        hr_reviewer_id: user.id,
        hr_approved_at: approvedAt,
        updated_at: approvedAt,
      })
      .eq("id", id);

    if (error) return { error: error.message };

    // No credit mutation needed: the FIFO balance derives consumption from
    // approved applications at read time.

    await logAudit({
      userId: user.id,
      userEmail: user.email,
      action: "approve_cto",
      tableName: "cto_applications",
      recordId: id,
      oldValues: {
        status: "pending",
        hr_approved_at: null,
        hr_reviewer_id: null,
      },
      newValues: {
        status: "approved",
        hr_approved_at: approvedAt,
        hr_reviewer_id: user.id,
        approved_by: user.email,
        role: user.role,
        employee_id: app.employee_id,
        start_date: app.start_date,
        end_date: app.end_date,
        hours_applied: app.hours_applied,
        dept_approved_at: app.dept_approved_at,
        dept_approved_by_id: app.department_head_id,
      },
    });

    revalidatePath(`/cto/${id}`);
    revalidatePath("/cto");
    revalidatePath("/cto/credits");
    revalidatePath(`/cto/credits/${app.employee_id}`);
    return { success: true, message: "CTO application approved" };
  }

  return { error: "Insufficient permissions" };
}

export async function rejectCto(id: string, reason: string) {
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
    .from("cto_applications")
    .select(
      "dept_approved_at, employee_id, start_date, end_date, hours_applied, created_by, employees(department_id), created_by_profile:user_profiles!cto_applications_created_by_fkey(role)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!app) return { error: "Application not found" };

  const rejectRestriction = ocmAdminRestrictionError(app, user);
  if (rejectRestriction) return { error: rejectRestriction };

  if (isDeptHead(user.role) && !isCompositeDeptAdminHead(user.role)) {
    if (!user.departmentId) return { error: "User has no department assigned" };
    const empDeptId =
      (app.employees as { department_id?: string | null } | null)?.department_id ?? null;
    if (empDeptId !== user.departmentId)
      return { error: "Cannot reject CTO outside your department" };
  }

  if (user.role === "hr_admin" && !app.dept_approved_at) {
    return { error: "Department head must approve this CTO first" };
  }

  const isRejectingAsDeptHead =
    isDeptHead(user.role) ||
    (user.role === "ocm_admin" && !app.dept_approved_at);

  const { error } = await supabase
    .schema("hris")
    .from("cto_applications")
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

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: isRejectingAsDeptHead ? "reject_cto_dept" : "reject_cto",
    tableName: "cto_applications",
    recordId: id,
    oldValues: { status: "pending" },
    newValues: {
      status: "rejected",
      rejection_reason: reason,
      rejected_by: user.email,
      rejected_by_role: user.role,
      employee_id: app.employee_id,
      start_date: app.start_date,
      end_date: app.end_date,
      hours_applied: app.hours_applied,
    },
  });

  revalidatePath(`/cto/${id}`);
  revalidatePath("/cto");
  return { success: true };
}

// ── COC Balances Report (credits page) ─────────────────────────────

export interface CtoBalanceReportRow {
  employee_id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  suffix: string | null;
  biometric_no: number;
  department_name: string | null;
  department_code: string | null;
  total_earned: number;
  available: number;
  expiring_soon: number;
  expired_forfeited: number;
}

export async function getCtoBalancesReport(): Promise<
  CtoBalanceReportRow[] | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["super_admin", "hr_admin"].includes(user.role))
    return { error: "Insufficient permissions" };

  const supabase = createAdminClient();

  const [{ data: credits, error: creditsErr }, { data: apps, error: appsErr }] =
    await Promise.all([
      supabase
        .schema("hris")
        .from("cto_credits")
        .select(`
          id, employee_id, ot_date, expiry_date, hours_earned, created_at,
          employees(
            first_name, last_name, middle_name, suffix, biometric_no,
            departments!employees_department_id_fkey(name, code)
          )
        `)
        .is("voided_at", null),
      supabase
        .schema("hris")
        .from("cto_applications")
        .select("id, employee_id, start_date, hours_applied, created_at")
        .eq("status", "approved"),
    ]);
  if (creditsErr) return { error: creditsErr.message };
  if (appsErr) return { error: appsErr.message };

  const usagesByEmployee = new Map<string, CtoUsageLite[]>();
  for (const a of apps ?? []) {
    const list = usagesByEmployee.get(a.employee_id) ?? [];
    list.push(a as CtoUsageLite);
    usagesByEmployee.set(a.employee_id, list);
  }

  type CreditRow = CtoEarnLite & {
    employee_id: string;
    employees: {
      first_name: string;
      last_name: string;
      middle_name: string | null;
      suffix: string | null;
      biometric_no: number;
      departments: { name: string; code: string } | null;
    } | null;
  };
  const earnsByEmployee = new Map<string, CreditRow[]>();
  for (const c of (credits ?? []) as unknown as CreditRow[]) {
    const list = earnsByEmployee.get(c.employee_id) ?? [];
    list.push(c);
    earnsByEmployee.set(c.employee_id, list);
  }

  const today = manilaToday();
  const rows: CtoBalanceReportRow[] = [];
  for (const [employeeId, earns] of earnsByEmployee) {
    const emp = earns[0].employees;
    if (!emp) continue;
    const balance = computeCtoBalance(
      earns,
      usagesByEmployee.get(employeeId) ?? [],
      today
    );
    rows.push({
      employee_id: employeeId,
      first_name: emp.first_name,
      last_name: emp.last_name,
      middle_name: emp.middle_name,
      suffix: emp.suffix,
      biometric_no: emp.biometric_no,
      department_name: emp.departments?.name ?? null,
      department_code: emp.departments?.code ?? null,
      total_earned: earns.reduce((acc, e) => acc + Number(e.hours_earned), 0),
      available: balance.available,
      expiring_soon: balance.expiringSoon,
      expired_forfeited: balance.expiredForfeited,
    });
  }

  rows.sort((a, b) =>
    `${a.last_name}, ${a.first_name}`.localeCompare(`${b.last_name}, ${b.first_name}`)
  );
  return rows;
}

// ── Audit trail for a CTO application (detail page) ────────────────

export async function getCtoAuditTrail(ctoId: string) {
  const user = await getCurrentUser();
  if (!user) return [];

  // Permission check — throws on unauthorized / not found
  try {
    await getCtoApplicationById(ctoId);
  } catch {
    return [];
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("audit_log")
    .select("*, user_profiles:user_id(full_name)")
    .eq("table_name", "cto_applications")
    .eq("record_id", ctoId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ── Per-employee ledger (credits/[employeeId] page) ────────────────

export interface CtoEmployeeLedger {
  credits: CtoCreditWithRelations[];
  approvedApplications: {
    id: string;
    start_date: string;
    end_date: string;
    cto_dates: string[];
    hours_applied: number;
    created_at: string;
  }[];
  balance: CtoBalanceResult;
}

export async function getEmployeeCtoLedger(
  employeeId: string
): Promise<CtoEmployeeLedger | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["super_admin", "hr_admin"].includes(user.role))
    return { error: "Insufficient permissions" };

  const supabase = createAdminClient();

  const [{ data: credits, error: creditsErr }, { data: apps, error: appsErr }] =
    await Promise.all([
      supabase
        .schema("hris")
        .from("cto_credits")
        .select(`
          *,
          employees(
            first_name, last_name, middle_name, suffix, biometric_no, department_id,
            departments!employees_department_id_fkey(name, code)
          )
        `)
        .eq("employee_id", employeeId)
        .order("ot_date", { ascending: false }),
      supabase
        .schema("hris")
        .from("cto_applications")
        .select("id, start_date, end_date, cto_dates, hours_applied, created_at")
        .eq("employee_id", employeeId)
        .eq("status", "approved")
        .order("start_date", { ascending: false }),
    ]);
  if (creditsErr) return { error: creditsErr.message };
  if (appsErr) return { error: appsErr.message };

  const allCredits = (credits ?? []) as CtoCreditWithRelations[];
  const activeEarns: CtoEarnLite[] = allCredits
    .filter((c) => !c.voided_at)
    .map((c) => ({
      id: c.id,
      ot_date: c.ot_date,
      expiry_date: c.expiry_date,
      hours_earned: Number(c.hours_earned),
      created_at: c.created_at,
    }));
  const usages: CtoUsageLite[] = (apps ?? []).map((a) => ({
    id: a.id,
    start_date: a.start_date,
    hours_applied: Number(a.hours_applied),
    created_at: a.created_at,
  }));

  return {
    credits: allCredits,
    approvedApplications: apps ?? [],
    balance: computeCtoBalance(activeEarns, usages, manilaToday()),
  };
}

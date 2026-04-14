"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";

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
    employee_no: string;
    first_name: string;
    last_name: string;
    departments: { name: string; code: string } | null;
  } | null;
}

export interface LeaveApplicationWithRelations {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_applied: number;
  reason: string | null;
  status: string;
  department_head_id: string | null;
  hr_reviewer_id: string | null;
  dept_approved_at: string | null;
  hr_approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  employees: {
    employee_no: string;
    first_name: string;
    last_name: string;
    department_id: string | null;
    departments: { name: string; code: string } | null;
    positions: { title: string } | null;
  } | null;
  leave_types: { code: string; name: string } | null;
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
    .from("leave_credits")
    .select(`
      *,
      leave_types(code, name),
      employees(
        employee_no, first_name, last_name,
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
  } else if (user.role === "department_head" && user.departmentId) {
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
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("leave_credits")
    .select("*, leave_types(code, name)")
    .eq("employee_id", employeeId)
    .eq("year", year);
  if (error) throw error;
  return data as LeaveCreditRow[];
}

export async function provisionLeaveCredits(employeeId: string, year: number) {
  const supabase = createAdminClient();

  // Get all leave types
  const { data: leaveTypes } = await supabase
    .schema("hris")
    .from("leave_types")
    .select("id, code, max_credits, is_cumulative");
  if (!leaveTypes) return { error: "Failed to fetch leave types" };

  // Check what already exists
  const { data: existing } = await supabase
    .schema("hris")
    .from("leave_credits")
    .select("leave_type_id")
    .eq("employee_id", employeeId)
    .eq("year", year);
  const existingIds = new Set((existing ?? []).map((e) => e.leave_type_id));

  const toInsert: { employee_id: string; leave_type_id: string; year: number; total_credits: number }[] = [];

  for (const lt of leaveTypes) {
    if (existingIds.has(lt.id)) continue;

    let credits = 0;
    if (lt.code === "VL" || lt.code === "SL") {
      credits = 15; // Standard annual provision
      // If cumulative, carry over from previous year
      if (lt.is_cumulative) {
        const { data: prev } = await supabase
          .schema("hris")
          .from("leave_credits")
          .select("balance")
          .eq("employee_id", employeeId)
          .eq("leave_type_id", lt.id)
          .eq("year", year - 1)
          .maybeSingle();
        if (prev && prev.balance > 0) {
          credits += Number(prev.balance);
        }
      }
    } else if (lt.max_credits) {
      credits = Number(lt.max_credits);
    }

    if (credits > 0) {
      toInsert.push({
        employee_id: employeeId,
        leave_type_id: lt.id,
        year,
        total_credits: credits,
      });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase
      .schema("hris")
      .from("leave_credits")
      .insert(toInsert);
    if (error) return { error: error.message };
  }

  revalidatePath("/leaves/credits");
  return { success: true, provisioned: toInsert.length };
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

  // Get current credit record
  const { data: credit } = await supabase
    .schema("hris")
    .from("leave_credits")
    .select("id, total_credits")
    .eq("employee_id", input.employee_id)
    .eq("leave_type_id", input.leave_type_id)
    .eq("year", input.year)
    .maybeSingle();

  if (credit) {
    // Update existing
    const newTotal = Number(credit.total_credits) + input.adjustment;
    if (newTotal < 0) return { error: "Adjustment would result in negative credits" };
    const { error } = await supabase
      .schema("hris")
      .from("leave_credits")
      .update({ total_credits: newTotal })
      .eq("id", credit.id);
    if (error) return { error: error.message };
  } else {
    // Create new
    if (input.adjustment < 0) return { error: "Cannot create credit with negative balance" };
    const { error } = await supabase
      .schema("hris")
      .from("leave_credits")
      .insert({
        employee_id: input.employee_id,
        leave_type_id: input.leave_type_id,
        year: input.year,
        total_credits: input.adjustment,
      });
    if (error) return { error: error.message };
  }

  revalidatePath("/leaves/credits");
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
        employee_no, first_name, last_name, department_id,
        departments!employees_department_id_fkey(name, code),
        positions(title)
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
  } else if (user.role === "department_head" && user.departmentId) {
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
  return data as LeaveApplicationWithRelations[];
}

export async function getLeaveApplicationById(id: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("leave_applications")
    .select(`
      *,
      employees(
        employee_no, first_name, last_name, department_id,
        departments!employees_department_id_fkey(name, code),
        positions(title)
      ),
      leave_types(code, name)
    `)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as LeaveApplicationWithRelations;
}

export async function createLeaveApplication(input: {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_applied: number;
  reason: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const year = new Date(input.start_date).getFullYear();

  // Validate credit balance
  const { data: credit } = await supabase
    .schema("hris")
    .from("leave_credits")
    .select("balance")
    .eq("employee_id", input.employee_id)
    .eq("leave_type_id", input.leave_type_id)
    .eq("year", year)
    .maybeSingle();

  if (credit && Number(credit.balance) < input.days_applied) {
    return { error: `Insufficient leave credits. Available: ${credit.balance} days` };
  }

  // Check for overlapping approved/pending leave
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
    .insert({ ...input, status: "pending" })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath("/leaves");
  return { data };
}

export async function cancelLeaveApplication(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  // Only pending leaves can be cancelled, and only by the applicant or HR
  const { data: app } = await supabase
    .schema("hris")
    .from("leave_applications")
    .select("employee_id, status")
    .eq("id", id)
    .single();

  if (!app) return { error: "Application not found" };
  if (app.status !== "pending") return { error: "Only pending applications can be cancelled" };

  // Check if user owns this leave or is HR
  if (!["super_admin", "hr_admin"].includes(user.role)) {
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("user_profile_id", user.id)
      .maybeSingle();
    if (!emp || emp.id !== app.employee_id) return { error: "Unauthorized" };
  }

  const { error } = await supabase
    .schema("hris")
    .from("leave_applications")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/leaves");
  revalidatePath(`/leaves/${id}`);
  return { success: true };
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
    .select("*, employees(department_id)")
    .eq("id", id)
    .single();

  if (!app) return { error: "Application not found" };
  if (app.status !== "pending") return { error: "Application is not pending" };

  // Department Head approval step
  if (user.role === "department_head") {
    if (app.dept_approved_at) return { error: "Department Head has already approved" };

    const { error } = await supabase
      .schema("hris")
      .from("leave_applications")
      .update({
        department_head_id: user.id,
        dept_approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { error: error.message };
    revalidatePath(`/leaves/${id}`);
    revalidatePath("/leaves");
    return { success: true, message: "Department Head approval recorded" };
  }

  // HR / Super Admin final approval
  if (["hr_admin", "super_admin"].includes(user.role)) {
    const { error } = await supabase
      .schema("hris")
      .from("leave_applications")
      .update({
        status: "approved",
        hr_reviewer_id: user.id,
        hr_approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { error: error.message };

    // Deduct leave credits
    const year = new Date(app.start_date).getFullYear();
    const { data: credit } = await supabase
      .schema("hris")
      .from("leave_credits")
      .select("id, used_credits")
      .eq("employee_id", app.employee_id)
      .eq("leave_type_id", app.leave_type_id)
      .eq("year", year)
      .maybeSingle();

    if (credit) {
      await supabase
        .schema("hris")
        .from("leave_credits")
        .update({ used_credits: Number(credit.used_credits) + Number(app.days_applied) })
        .eq("id", credit.id);
    }

    revalidatePath(`/leaves/${id}`);
    revalidatePath("/leaves");
    revalidatePath("/leaves/credits");
    return { success: true, message: "Leave application approved and credits deducted" };
  }

  return { error: "Insufficient permissions" };
}

export async function rejectLeave(id: string, reason: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!["department_head", "hr_admin", "super_admin"].includes(user.role))
    return { error: "Insufficient permissions" };

  const supabase = createAdminClient();

  const { error } = await supabase
    .schema("hris")
    .from("leave_applications")
    .update({
      status: "rejected",
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
      ...(user.role === "department_head"
        ? { department_head_id: user.id }
        : { hr_reviewer_id: user.id }),
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) return { error: error.message };
  revalidatePath(`/leaves/${id}`);
  revalidatePath("/leaves");
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
  status: string;
  created_at: string;
  leave_types: { code: string; name: string } | null;
}

export async function getLeaveLedger(employeeId: string, year: number) {
  const supabase = createAdminClient();

  const startOfYear = `${year}-01-01`;
  const endOfYear = `${year}-12-31`;

  const { data, error } = await supabase
    .schema("hris")
    .from("leave_applications")
    .select("id, employee_id, leave_type_id, start_date, end_date, days_applied, status, created_at, leave_types(code, name)")
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

// ── Bulk Provisioning ──────────────────────────────────────────────

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

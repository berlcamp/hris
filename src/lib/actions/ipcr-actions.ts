"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getAdjectivalRating } from "@/lib/ipcr-utils";

// --- Types ---

export interface IpcrPeriodRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export interface IpcrRecordWithRelations {
  id: string;
  employee_id: string;
  period_id: string;
  numerical_rating: number | null;
  adjectival_rating: string | null;
  status: string;
  reviewed_by: string | null;
  approved_by: string | null;
  remarks: string | null;
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
  ipcr_periods: {
    name: string;
    start_date: string;
    end_date: string;
  } | null;
  reviewer: { full_name: string } | null;
  approver: { full_name: string } | null;
}

// --- IPCR Periods ---

export async function getIpcrPeriods(): Promise<IpcrPeriodRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("ipcr_periods")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return (data ?? []) as IpcrPeriodRow[];
}

export async function getActivePeriod(): Promise<IpcrPeriodRow | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .schema("hris")
    .from("ipcr_periods")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  return data as IpcrPeriodRow | null;
}

export async function createIpcrPeriod(input: {
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}) {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  // If setting as active, deactivate others
  if (input.is_active) {
    await supabase
      .schema("hris")
      .from("ipcr_periods")
      .update({ is_active: false })
      .eq("is_active", true);
  }

  const { error } = await supabase
    .schema("hris")
    .from("ipcr_periods")
    .insert({
      name: input.name,
      start_date: input.start_date,
      end_date: input.end_date,
      is_active: input.is_active,
    });

  if (error) throw error;
  revalidatePath("/admin/ipcr-periods");
  revalidatePath("/performance");
  return { success: true };
}

export async function updateIpcrPeriod(
  id: string,
  input: {
    name: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
  }
) {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  // If setting as active, deactivate others
  if (input.is_active) {
    await supabase
      .schema("hris")
      .from("ipcr_periods")
      .update({ is_active: false })
      .neq("id", id)
      .eq("is_active", true);
  }

  const { error } = await supabase
    .schema("hris")
    .from("ipcr_periods")
    .update({
      name: input.name,
      start_date: input.start_date,
      end_date: input.end_date,
      is_active: input.is_active,
    })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/admin/ipcr-periods");
  revalidatePath("/performance");
  return { success: true };
}

export async function deleteIpcrPeriod(id: string) {
  const user = await getCurrentUser();
  if (!user || !["super_admin"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  // Check for existing records
  const { count } = await supabase
    .schema("hris")
    .from("ipcr_records")
    .select("id", { count: "exact", head: true })
    .eq("period_id", id);

  if (count && count > 0) {
    return { error: "Cannot delete period with existing IPCR records" };
  }

  const { error } = await supabase
    .schema("hris")
    .from("ipcr_periods")
    .delete()
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/admin/ipcr-periods");
  return { success: true };
}

export async function togglePeriodActive(id: string, isActive: boolean) {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  if (isActive) {
    // Deactivate all others first
    await supabase
      .schema("hris")
      .from("ipcr_periods")
      .update({ is_active: false })
      .eq("is_active", true);
  }

  const { error } = await supabase
    .schema("hris")
    .from("ipcr_periods")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/admin/ipcr-periods");
  revalidatePath("/performance");
  return { success: true };
}

// --- IPCR Records ---

export async function getIpcrRecords(periodId?: string): Promise<IpcrRecordWithRelations[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("ipcr_records")
    .select(
      `*,
       employees!ipcr_records_employee_id_fkey(
         employee_no, first_name, last_name, department_id,
         departments!employees_department_id_fkey(name, code),
         positions(title)
       ),
       ipcr_periods!ipcr_records_period_id_fkey(name, start_date, end_date),
       reviewer:user_profiles!ipcr_records_reviewed_by_fkey(full_name),
       approver:user_profiles!ipcr_records_approved_by_fkey(full_name)`
    )
    .order("created_at", { ascending: false });

  if (periodId) {
    query = query.eq("period_id", periodId);
  }

  // Role-based filtering
  if (user.role === "employee") {
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("user_profile_id", user.id)
      .maybeSingle();
    if (emp) {
      query = query.eq("employee_id", emp.id);
    } else {
      return [];
    }
  } else if (user.role === "department_head" && user.departmentId) {
    const { data: deptEmps } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("department_id", user.departmentId);
    if (deptEmps && deptEmps.length > 0) {
      query = query.in("employee_id", deptEmps.map((e) => e.id));
    } else {
      return [];
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as IpcrRecordWithRelations[];
}

export async function getIpcrRecordById(id: string): Promise<IpcrRecordWithRelations | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("ipcr_records")
    .select(
      `*,
       employees!ipcr_records_employee_id_fkey(
         employee_no, first_name, last_name, department_id,
         departments!employees_department_id_fkey(name, code),
         positions(title)
       ),
       ipcr_periods!ipcr_records_period_id_fkey(name, start_date, end_date),
       reviewer:user_profiles!ipcr_records_reviewed_by_fkey(full_name),
       approver:user_profiles!ipcr_records_approved_by_fkey(full_name)`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as IpcrRecordWithRelations | null;
}

export async function createIpcrRecord(input: {
  employee_id: string;
  period_id: string;
  numerical_rating?: number;
  remarks?: string;
}) {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin", "department_head"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  // Check for duplicate (same employee + period)
  const { data: existing } = await supabase
    .schema("hris")
    .from("ipcr_records")
    .select("id")
    .eq("employee_id", input.employee_id)
    .eq("period_id", input.period_id)
    .maybeSingle();

  if (existing) {
    return { error: "An IPCR record already exists for this employee in this period" };
  }

  const adjectival = input.numerical_rating
    ? getAdjectivalRating(input.numerical_rating)
    : null;

  const { data, error } = await supabase
    .schema("hris")
    .from("ipcr_records")
    .insert({
      employee_id: input.employee_id,
      period_id: input.period_id,
      numerical_rating: input.numerical_rating ?? null,
      adjectival_rating: adjectival,
      status: "draft",
      remarks: input.remarks || null,
    })
    .select("id")
    .single();

  if (error) throw error;
  revalidatePath("/performance");
  return { success: true, id: data.id };
}

export async function updateIpcrRating(
  id: string,
  input: {
    numerical_rating: number;
    remarks?: string;
  }
) {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin", "department_head"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  const adjectival = getAdjectivalRating(input.numerical_rating);

  const { error } = await supabase
    .schema("hris")
    .from("ipcr_records")
    .update({
      numerical_rating: input.numerical_rating,
      adjectival_rating: adjectival,
      remarks: input.remarks || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/performance");
  revalidatePath(`/performance/${id}`);
  return { success: true };
}

export async function submitIpcrRecord(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const supabase = createAdminClient();

  // Verify record is in draft
  const { data: record } = await supabase
    .schema("hris")
    .from("ipcr_records")
    .select("status, numerical_rating")
    .eq("id", id)
    .single();

  if (!record) return { error: "Record not found" };
  if (record.status !== "draft") return { error: "Only draft records can be submitted" };
  if (!record.numerical_rating) return { error: "Rating is required before submission" };

  const { error } = await supabase
    .schema("hris")
    .from("ipcr_records")
    .update({
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/performance");
  revalidatePath(`/performance/${id}`);
  return { success: true };
}

export async function reviewIpcrRecord(
  id: string,
  approve: boolean,
  remarks?: string
) {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin", "department_head"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  const { data: record } = await supabase
    .schema("hris")
    .from("ipcr_records")
    .select("status")
    .eq("id", id)
    .single();

  if (!record) return { error: "Record not found" };
  if (record.status !== "pending") return { error: "Only pending records can be reviewed" };

  if (approve) {
    const { error } = await supabase
      .schema("hris")
      .from("ipcr_records")
      .update({
        status: "approved",
        reviewed_by: user.id,
        approved_by: user.id,
        remarks: remarks || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .schema("hris")
      .from("ipcr_records")
      .update({
        status: "rejected",
        reviewed_by: user.id,
        remarks: remarks || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;
  }

  revalidatePath("/performance");
  revalidatePath(`/performance/${id}`);
  return { success: true };
}

// --- IPCR check for NOSI eligibility ---

export async function hasAtLeastSatisfactoryIpcr(employeeId: string): Promise<boolean> {
  const supabase = createAdminClient();

  // Check for any approved IPCR with at least Satisfactory in any recent period
  const { data } = await supabase
    .schema("hris")
    .from("ipcr_records")
    .select("id, numerical_rating")
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .gte("numerical_rating", 2.5)
    .order("created_at", { ascending: false })
    .limit(1);

  return (data ?? []).length > 0;
}

// --- Get employee IPCR history (for employee profile) ---

export async function getEmployeeIpcrHistory(employeeId: string): Promise<IpcrRecordWithRelations[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("ipcr_records")
    .select(
      `*,
       employees!ipcr_records_employee_id_fkey(
         employee_no, first_name, last_name, department_id,
         departments!employees_department_id_fkey(name, code),
         positions(title)
       ),
       ipcr_periods!ipcr_records_period_id_fkey(name, start_date, end_date),
       reviewer:user_profiles!ipcr_records_reviewed_by_fkey(full_name),
       approver:user_profiles!ipcr_records_approved_by_fkey(full_name)`
    )
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as IpcrRecordWithRelations[];
}

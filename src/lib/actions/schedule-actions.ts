"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  scheduleFormSchema,
  type ScheduleFormValues,
} from "@/lib/validations/schedule-schema";
import { canManageSchedules } from "@/lib/auth-helpers";
import type { UserRole } from "@/lib/types";

export interface ScheduleRow {
  id: string;
  name: string;
  time_in: string; // HH:MM:SS from DB; normalized to HH:MM by caller
  time_out: string;
  break_start: string | null;
  break_end: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleWithAssignedCount extends ScheduleRow {
  assigned_count: number;
}

function trimTime(t: string | null): string | null {
  if (!t) return null;
  return t.slice(0, 5);
}

function requireAdmin(role: string | undefined) {
  if (!canManageSchedules(role as UserRole | undefined)) {
    throw new Error("You do not have permission to manage schedules.");
  }
}

export async function getSchedules(): Promise<ScheduleRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("schedules")
    .select("id, name, time_in, time_out, break_start, break_end, notes, created_at, updated_at")
    .order("time_in", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((s) => ({
    ...s,
    time_in: trimTime(s.time_in)!,
    time_out: trimTime(s.time_out)!,
    break_start: trimTime(s.break_start),
    break_end: trimTime(s.break_end),
  })) as ScheduleRow[];
}

export async function getSchedulesWithCounts(): Promise<ScheduleWithAssignedCount[]> {
  const supabase = createAdminClient();
  const [{ data: schedules, error: schedErr }, { data: employees, error: empErr }] =
    await Promise.all([
      supabase
        .schema("hris")
        .from("schedules")
        .select("id, name, time_in, time_out, break_start, break_end, notes, created_at, updated_at")
        .order("time_in", { ascending: true }),
      supabase
        .schema("hris")
        .from("employees")
        .select("schedule_id")
        .not("schedule_id", "is", null),
    ]);
  if (schedErr) throw schedErr;
  if (empErr) throw empErr;

  const counts = new Map<string, number>();
  for (const row of employees ?? []) {
    const id = (row as { schedule_id: string | null }).schedule_id;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (schedules ?? []).map((s) => ({
    ...s,
    time_in: trimTime(s.time_in)!,
    time_out: trimTime(s.time_out)!,
    break_start: trimTime(s.break_start),
    break_end: trimTime(s.break_end),
    assigned_count: counts.get(s.id) ?? 0,
  })) as ScheduleWithAssignedCount[];
}

export async function createSchedule(
  input: ScheduleFormValues,
): Promise<{ data?: ScheduleRow; error?: string }> {
  const user = await getCurrentUser();
  try {
    requireAdmin(user?.role);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const parsed = scheduleFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("schedules")
    .insert({
      name: v.name,
      time_in: v.time_in,
      time_out: v.time_out,
      break_start: v.has_break ? v.break_start : null,
      break_end: v.has_break ? v.break_end : null,
      notes: v.notes,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A schedule with that name already exists." };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    tableName: "schedules",
    recordId: data.id,
    newValues: { name: v.name, time_in: v.time_in, time_out: v.time_out },
  });

  revalidatePath("/admin/schedules");
  revalidatePath("/employees");
  return { data: data as ScheduleRow };
}

export async function updateSchedule(
  id: string,
  input: ScheduleFormValues,
): Promise<{ data?: ScheduleRow; error?: string }> {
  const user = await getCurrentUser();
  try {
    requireAdmin(user?.role);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const parsed = scheduleFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("schedules")
    .update({
      name: v.name,
      time_in: v.time_in,
      time_out: v.time_out,
      break_start: v.has_break ? v.break_start : null,
      break_end: v.has_break ? v.break_end : null,
      notes: v.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A schedule with that name already exists." };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "schedules",
    recordId: id,
    newValues: { name: v.name, time_in: v.time_in, time_out: v.time_out },
  });

  revalidatePath("/admin/schedules");
  revalidatePath("/employees");
  return { data: data as ScheduleRow };
}

export async function deleteSchedule(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  try {
    requireAdmin(user?.role);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("schedules")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    tableName: "schedules",
    recordId: id,
  });

  revalidatePath("/admin/schedules");
  revalidatePath("/employees");
  return { success: true };
}

export async function getEmployeesForSchedule(
  scheduleId: string | null,
): Promise<{
  id: string;
  biometric_no: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  department: string | null;
}[]> {
  const supabase = createAdminClient();
  let query = supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, biometric_no, first_name, last_name, middle_name, departments!employees_department_id_fkey(name)",
    )
    .eq("status", "active")
    .eq("employment_type", "plantilla")
    .order("last_name", { ascending: true });

  if (scheduleId === null) {
    query = query.is("schedule_id", null);
  } else {
    query = query.eq("schedule_id", scheduleId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((e) => {
    const row = e as unknown as {
      id: string;
      biometric_no: number;
      first_name: string;
      last_name: string;
      middle_name: string | null;
      departments: { name: string } | null;
    };
    return {
      id: row.id,
      biometric_no: row.biometric_no,
      first_name: row.first_name,
      last_name: row.last_name,
      middle_name: row.middle_name,
      department: row.departments?.name ?? null,
    };
  });
}

export async function assignEmployeesToSchedule(
  scheduleId: string,
  employeeIds: string[],
): Promise<{ updated: number; error?: string }> {
  const user = await getCurrentUser();
  try {
    requireAdmin(user?.role);
  } catch (e) {
    return { updated: 0, error: (e as Error).message };
  }

  if (employeeIds.length === 0) return { updated: 0 };

  const supabase = createAdminClient();
  const { error, count } = await supabase
    .schema("hris")
    .from("employees")
    .update({ schedule_id: scheduleId }, { count: "exact" })
    .in("id", employeeIds);

  if (error) return { updated: 0, error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "assign_schedule",
    tableName: "employees",
    newValues: { schedule_id: scheduleId, employee_ids: employeeIds },
  });

  revalidatePath("/admin/schedules");
  revalidatePath("/employees");
  return { updated: count ?? employeeIds.length };
}

export async function unassignEmployeesFromSchedule(
  employeeIds: string[],
): Promise<{ updated: number; error?: string }> {
  const user = await getCurrentUser();
  try {
    requireAdmin(user?.role);
  } catch (e) {
    return { updated: 0, error: (e as Error).message };
  }

  if (employeeIds.length === 0) return { updated: 0 };

  const supabase = createAdminClient();
  const { error, count } = await supabase
    .schema("hris")
    .from("employees")
    .update({ schedule_id: null }, { count: "exact" })
    .in("id", employeeIds);

  if (error) return { updated: 0, error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "unassign_schedule",
    tableName: "employees",
    newValues: { employee_ids: employeeIds },
  });

  revalidatePath("/admin/schedules");
  revalidatePath("/employees");
  return { updated: count ?? employeeIds.length };
}

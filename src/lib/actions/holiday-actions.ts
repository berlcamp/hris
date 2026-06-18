"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import { canManageSchedules } from "@/lib/auth-helpers";
import {
  holidayFormSchema,
  type HolidayFormValues,
  type HolidayType,
} from "@/lib/validations/holiday-schema";
import type { UserRole } from "@/lib/types";

export interface HolidayRow {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  type: HolidayType;
  created_at: string;
  updated_at: string;
}

function requireManager(role: UserRole | undefined) {
  if (!canManageSchedules(role)) {
    throw new Error("You do not have permission to manage holidays.");
  }
}

export async function getHolidays(): Promise<HolidayRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("holidays")
    .select("id, date, name, type, created_at, updated_at")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HolidayRow[];
}

export async function createHoliday(
  input: HolidayFormValues,
): Promise<{ data?: HolidayRow; error?: string }> {
  const user = await getCurrentUser();
  try {
    requireManager(user?.role);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const parsed = holidayFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("holidays")
    .insert({ date: v.date, name: v.name, type: v.type })
    .select("id, date, name, type, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A holiday already exists on that date." };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    tableName: "holidays",
    recordId: data.id,
    newValues: { date: v.date, name: v.name, type: v.type },
  });

  revalidatePath("/attendance/holidays");
  return { data: data as HolidayRow };
}

export async function updateHoliday(
  id: string,
  input: HolidayFormValues,
): Promise<{ data?: HolidayRow; error?: string }> {
  const user = await getCurrentUser();
  try {
    requireManager(user?.role);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const parsed = holidayFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("holidays")
    .update({
      date: v.date,
      name: v.name,
      type: v.type,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, date, name, type, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A holiday already exists on that date." };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "holidays",
    recordId: id,
    newValues: { date: v.date, name: v.name, type: v.type },
  });

  revalidatePath("/attendance/holidays");
  return { data: data as HolidayRow };
}

export async function deleteHoliday(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  try {
    requireManager(user?.role);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("holidays")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    tableName: "holidays",
    recordId: id,
  });

  revalidatePath("/attendance/holidays");
  return { success: true };
}

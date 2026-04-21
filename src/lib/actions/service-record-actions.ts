"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  serviceRecordFormSchema,
  type ServiceRecordFormInput,
} from "@/lib/validations/service-record-schema";
import type {
  ServiceRecord,
  ServiceRecordActivityLogEntry,
} from "@/lib/types";

function isHrRole(role: string | undefined) {
  return role === "super_admin" || role === "hr_admin";
}

async function logServiceRecordActivity(
  serviceRecordId: string,
  action: "created" | "updated" | "deleted",
  description: string,
  userId: string | null
) {
  const supabase = createAdminClient();
  await supabase.schema("hris").from("service_records_activity_log").insert({
    service_record_id: serviceRecordId,
    user_id: userId,
    action,
    description,
  });
}

export async function createServiceRecord(
  employeeId: string,
  input: ServiceRecordFormInput
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!isHrRole(user.role)) return { error: "Insufficient permissions" };

  const parsed = serviceRecordFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const values = parsed.data;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("service_records")
    .insert({
      employee_id: employeeId,
      date_from: values.date_from,
      date_to: values.date_to || null,
      designation: values.designation,
      status_type: values.status_type,
      salary: values.salary,
      office: values.office,
      branch: values.branch,
      agency: values.agency,
      leave_without_pay: values.leave_without_pay,
      daily_salary: values.daily_salary,
      separation_date: values.separation_date || null,
      separation_cause: values.separation_cause,
      remarks: values.remarks,
      salary_grade: values.salary_grade,
      step_increment: values.step_increment,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await logServiceRecordActivity(
    data.id,
    "created",
    `Created service record: ${values.designation} (${values.date_from} → ${values.date_to ?? "Present"})`,
    user.id
  );
  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "create",
    tableName: "service_records",
    recordId: data.id,
    newValues: { designation: values.designation, date_from: values.date_from },
  });

  revalidatePath(`/employees/${employeeId}`);
  return { data: data as ServiceRecord };
}

export async function updateServiceRecord(
  id: string,
  input: ServiceRecordFormInput
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!isHrRole(user.role)) return { error: "Insufficient permissions" };

  const parsed = serviceRecordFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const values = parsed.data;

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .schema("hris")
    .from("service_records")
    .select("employee_id, designation, date_from, date_to")
    .eq("id", id)
    .single();

  if (!existing) return { error: "Service record not found" };

  const { data, error } = await supabase
    .schema("hris")
    .from("service_records")
    .update({
      date_from: values.date_from,
      date_to: values.date_to || null,
      designation: values.designation,
      status_type: values.status_type,
      salary: values.salary,
      office: values.office,
      branch: values.branch,
      agency: values.agency,
      leave_without_pay: values.leave_without_pay,
      daily_salary: values.daily_salary,
      separation_date: values.separation_date || null,
      separation_cause: values.separation_cause,
      remarks: values.remarks,
      salary_grade: values.salary_grade,
      step_increment: values.step_increment,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  await logServiceRecordActivity(
    id,
    "updated",
    `Updated service record: ${values.designation} (${values.date_from} → ${values.date_to ?? "Present"})`,
    user.id
  );
  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "update",
    tableName: "service_records",
    recordId: id,
    oldValues: existing,
    newValues: { designation: values.designation, date_from: values.date_from },
  });

  revalidatePath(`/employees/${existing.employee_id}`);
  return { data: data as ServiceRecord };
}

export async function deleteServiceRecord(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!isHrRole(user.role)) return { error: "Insufficient permissions" };

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .schema("hris")
    .from("service_records")
    .select("employee_id, designation, date_from")
    .eq("id", id)
    .single();

  if (!existing) return { error: "Service record not found" };

  const { error } = await supabase
    .schema("hris")
    .from("service_records")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "delete",
    tableName: "service_records",
    recordId: id,
    oldValues: existing,
  });

  revalidatePath(`/employees/${existing.employee_id}`);
  return { success: true };
}

export async function getServiceRecordActivityLog(
  serviceRecordId: string
): Promise<ServiceRecordActivityLogEntry[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("service_records_activity_log")
    .select("*, user_profiles(full_name, email)")
    .eq("service_record_id", serviceRecordId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    user_profiles: Array.isArray(row.user_profiles)
      ? row.user_profiles[0] ?? null
      : row.user_profiles,
  })) as ServiceRecordActivityLogEntry[];
}

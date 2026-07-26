"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  jobOrderAreaSchema,
  type JobOrderAreaValues,
} from "@/lib/validations/job-order-schema";
import type { JobOrderArea } from "@/lib/types";

function trimNullable(s: string | null | undefined): string | null {
  if (s == null) return null;
  const v = s.trim();
  return v.length === 0 ? null : v;
}

export async function getJobOrderAreas(
  opts: { includeInactive?: boolean } = {},
): Promise<JobOrderArea[]> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("job_order_areas")
    .select("id, name, description, is_active, created_at, updated_at")
    .is("deleted_at", null)
    .order("name");

  if (!opts.includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw error;

  // Counts drive the "N employees" column and the delete guard. Fetched in one
  // extra round trip rather than per-row.
  const { data: members } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .select("area_id")
    .is("deleted_at", null);

  const counts = new Map<string, number>();
  for (const m of members ?? []) {
    counts.set(m.area_id, (counts.get(m.area_id) ?? 0) + 1);
  }

  return (data ?? []).map((a) => ({
    ...a,
    employee_count: counts.get(a.id) ?? 0,
  }));
}

export async function createJobOrderArea(input: JobOrderAreaValues) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderAreaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors[0] ?? "Invalid area" };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .insert({
      name: parsed.data.name,
      description: trimNullable(parsed.data.description),
      is_active: parsed.data.is_active,
      created_by: user!.id,
      updated_by: user!.id,
    })
    .select("id, name, description, is_active, created_at, updated_at")
    .single();

  // 23505 = unique_violation on uq_job_order_areas_normalized_name.
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "An area with that name already exists"
          : error.message,
    };
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    tableName: "job_order_areas",
    recordId: data.id,
    newValues: data,
  });

  revalidatePath("/job-orders/areas");
  revalidatePath("/job-orders");
  return { data: { ...data, employee_count: 0 } };
}

export async function updateJobOrderArea(
  id: string,
  input: JobOrderAreaValues,
) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderAreaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors[0] ?? "Invalid area" };
  }

  const supabase = createAdminClient();

  const { data: before } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .select("id, name, description, is_active")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .update({
      name: parsed.data.name,
      description: trimNullable(parsed.data.description),
      is_active: parsed.data.is_active,
      updated_by: user!.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, description, is_active, created_at, updated_at")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "An area with that name already exists"
          : error.message,
    };
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_areas",
    recordId: id,
    oldValues: before,
    newValues: data,
  });

  revalidatePath("/job-orders/areas");
  revalidatePath("/job-orders");
  return { data };
}

export async function deleteJobOrderArea(id: string) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  // Guard before soft-deleting: an area with members would leave those rows
  // pointing at a deleted area. The FK is ON DELETE RESTRICT, but this is a
  // soft delete so the FK would not fire.
  const { count } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .select("id", { count: "exact", head: true })
    .eq("area_id", id)
    .is("deleted_at", null);

  if ((count ?? 0) > 0) {
    return {
      error: `Cannot delete: ${count} employee${count === 1 ? "" : "s"} still assigned to this area. Reassign them first.`,
    };
  }

  const { error } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .update({ deleted_at: new Date().toISOString(), updated_by: user!.id })
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    tableName: "job_order_areas",
    recordId: id,
  });

  revalidatePath("/job-orders/areas");
  return { success: true as const };
}

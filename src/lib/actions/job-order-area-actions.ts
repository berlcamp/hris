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

// supabase/config.toml sets PostgREST's `max_rows` to 1000. A plain
// un-paginated select past that many live rows is silently truncated by
// PostgREST — no error, no warning — which would quietly undercount every
// area once the org-wide job_order_employees roster crosses the cap. Page
// through with `.range()` in chunks of 1000 (matching max_rows) until a page
// comes back short, so the totals stay correct as the roster grows. Do not
// "simplify" this back into a single select.
async function countEmployeesByArea(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Map<string, number>> {
  const PAGE_SIZE = 1000;
  const counts = new Map<string, number>();
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_employees")
      .select("area_id")
      .is("deleted_at", null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `Failed to compute job order area employee counts: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      counts.set(row.area_id, (counts.get(row.area_id) ?? 0) + 1);
    }

    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return counts;
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

  // Counts drive the "N employees" column and the delete guard. A failure
  // here must not silently render every area as empty — that could induce an
  // admin to delete an area that actually still has members — so we let it
  // throw same as the primary query above rather than swallowing it.
  const counts = await countEmployeesByArea(supabase);

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

  // Fetched alongside `before` (not after the write) so we have a fallback
  // ready if the post-update recount below fails. This edit only touches
  // name/description/is_active, never job_order_employees.area_id, so a
  // count taken immediately before the write is still an accurate "live"
  // count immediately after it in the normal case.
  const [
    { data: before },
    { count: countBeforeUpdate, error: countBeforeError },
  ] = await Promise.all([
    supabase
      .schema("hris")
      .from("job_order_areas")
      .select("id, name, description, is_active")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .schema("hris")
      .from("job_order_employees")
      .select("id", { count: "exact", head: true })
      .eq("area_id", id)
      .is("deleted_at", null),
  ]);

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

  // JobOrderArea requires a real employee_count (unlike a brand-new area,
  // an edited one can already have members, so 0 would misrepresent it and
  // could lead an admin to delete an area that still has people in it). Get
  // the live post-update count with a single exact head-count query — this
  // is NOT subject to PostgREST's max_rows truncation the way the org-wide
  // per-area listing in getJobOrderAreas is, because `count: "exact"` comes
  // from a COUNT(*), not from returned rows, and we're only counting one
  // area here. The update itself already succeeded, so if this recount
  // fails we don't fail the whole request — we fall back to the count taken
  // just before the write (see above) rather than inventing 0, since that
  // pre-write count is still accurate for an edit that never touches
  // area_id. Only if both reads failed do we fall back to 0, which can only
  // happen if the database became unreachable moments after accepting the
  // update itself — an edge case the `number`-typed contract has no way to
  // flag as "unknown".
  const { count: countAfterUpdate, error: countAfterError } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .select("id", { count: "exact", head: true })
    .eq("area_id", id)
    .is("deleted_at", null);

  const employee_count = !countAfterError
    ? (countAfterUpdate ?? 0)
    : !countBeforeError
      ? (countBeforeUpdate ?? 0)
      : 0;

  return { data: { ...data, employee_count } };
}

export async function deleteJobOrderArea(id: string) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  // Guard before soft-deleting: an area with members would leave those rows
  // pointing at a deleted area. The FK is ON DELETE RESTRICT, but this is a
  // soft delete so the FK would not fire. Fail CLOSED: if the count query
  // itself errors (or comes back with no count and no error), we cannot
  // verify the area is empty, so refuse the delete rather than treating
  // "unknown" as "zero assigned".
  const { count, error: countError } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .select("id", { count: "exact", head: true })
    .eq("area_id", id)
    .is("deleted_at", null);

  if (countError) {
    return {
      error: `Could not verify whether employees are still assigned to this area: ${countError.message}. Delete aborted.`,
    };
  }

  if (count == null) {
    return {
      error:
        "Could not verify whether employees are still assigned to this area. Delete aborted.",
    };
  }

  if (count > 0) {
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

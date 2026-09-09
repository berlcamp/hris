"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  JOB_ORDER_SPECIAL_ORDER_MAX_PAGE_SIZE,
  JOB_ORDER_SPECIAL_ORDER_PAGE_SIZE,
  SPECIAL_ORDER_SELECT,
  loadJobOrdersForSpecialOrder,
  loadSpecialOrderMembers,
  toSpecialOrderMemberSnapshot,
} from "@/lib/job-order-special-order-repo";
import {
  jobOrderSpecialOrderCreateSchema,
  jobOrderSpecialOrderDuplicateSchema,
  jobOrderSpecialOrderMemberSchema,
  jobOrderSpecialOrderMetadataSchema,
  type JobOrderSpecialOrderCreateValues,
  type JobOrderSpecialOrderDuplicateValues,
  type JobOrderSpecialOrderMemberValues,
  type JobOrderSpecialOrderMetadataValues,
} from "@/lib/validations/job-order-special-order-schema";
import { buildIlikeOrFilter } from "@/lib/postgrest-filters";
import type {
  JobOrderSpecialOrder,
  JobOrderSpecialOrderMember,
  JobOrderSpecialOrderPickerOption,
} from "@/lib/types";

// The page-size constants live in job-order-special-order-repo.ts, not here: a
// `"use server"` module may only export async functions, so a plain
// `export const` in this file is a build error — and the list client needs the
// same number to compute its page count.

/**
 * Deletes a just-created order whose member insert failed, so a zero-member
 * order isn't stranded. Logged rather than thrown: the caller already has the
 * original error to surface and must still return it.
 */
async function cleanupOrphanedSpecialOrder(
  supabase: ReturnType<typeof createAdminClient>,
  specialOrderId: string,
): Promise<void> {
  const { error } = await supabase
    .schema("hris")
    .from("job_order_special_orders")
    .delete()
    .eq("id", specialOrderId);
  if (error) {
    console.error(
      `cleanupOrphanedSpecialOrder: failed to delete orphaned special order ${specialOrderId}: ${error.message}`,
    );
  }
}

/** Member counts for a page of Special Orders, in one round trip. */
async function countMembers(
  supabase: ReturnType<typeof createAdminClient>,
  orderIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (orderIds.length === 0) return counts;

  // Paged for the same reason getJobOrderMemos pages its member read: a page
  // of 20 orders each covering a large slice of the roster can exceed
  // PostgREST's 1000-row cap, and a silent truncation would zero the counts of
  // whichever orders land past the cut. `.order("special_order_id")` keeps the
  // page boundaries stable across requests.
  const CHUNK = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_special_order_members")
      .select("special_order_id")
      .in("special_order_id", orderIds)
      .order("special_order_id")
      .range(from, from + CHUNK - 1);
    if (error) throw error;

    const rows = (data ?? []) as { special_order_id: string }[];
    for (const r of rows) {
      counts.set(r.special_order_id, (counts.get(r.special_order_id) ?? 0) + 1);
    }
    if (rows.length < CHUNK) break;
    from += CHUNK;
  }

  return counts;
}

// ── Reads ────────────────────────────────────────────────────────────

export interface JobOrderSpecialOrderFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export async function getJobOrderSpecialOrders(
  filters: JobOrderSpecialOrderFilters = {},
): Promise<{ rows: JobOrderSpecialOrder[]; totalCount: number }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { rows: [], totalCount: 0 };

  const supabase = createAdminClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    JOB_ORDER_SPECIAL_ORDER_MAX_PAGE_SIZE,
    Math.max(1, filters.pageSize ?? JOB_ORDER_SPECIAL_ORDER_PAGE_SIZE),
  );
  const from = (page - 1) * pageSize;

  let query = supabase
    .schema("hris")
    .from("job_order_special_orders")
    .select(SPECIAL_ORDER_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order("so_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.dateFrom) query = query.gte("so_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("so_date", filters.dateTo);
  if (filters.search?.trim()) {
    // buildIlikeOrFilter, not a hand-built `.or(...)`: a comma or parenthesis
    // in the term would otherwise become a PostgREST 400.
    query = query.or(
      buildIlikeOrFilter(
        ["subject", "so_no", "period_covered"],
        filters.search.trim(),
      ),
    );
  }

  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw error;
  if (!data || data.length === 0) return { rows: [], totalCount: count ?? 0 };

  const ids = data.map((r) => (r as { id: string }).id);
  const counts = await countMembers(supabase, ids);

  const rows: JobOrderSpecialOrder[] = data.map((raw) => {
    const so = raw as unknown as JobOrderSpecialOrder;
    return { ...so, member_count: counts.get(so.id) ?? 0 };
  });

  return { rows, totalCount: count ?? 0 };
}

export async function getJobOrderSpecialOrderById(id: string): Promise<{
  specialOrder: JobOrderSpecialOrder | null;
  members: JobOrderSpecialOrderMember[];
}> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) {
    return { specialOrder: null, members: [] };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_special_orders")
    .select(SPECIAL_ORDER_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { specialOrder: null, members: [] };

  const members = await loadSpecialOrderMembers(supabase, id);

  return {
    specialOrder: {
      ...(data as unknown as JobOrderSpecialOrder),
      member_count: members.length,
    },
    members,
  };
}

/** Every active Job Order employee, for the create dialog's picker. */
export async function getJobOrdersForSpecialOrderPicker(): Promise<
  JobOrderSpecialOrderPickerOption[]
> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return [];

  const supabase = createAdminClient();
  return loadJobOrdersForSpecialOrder(supabase);
}

/** Active Job Order employees not already listed on this Special Order. */
export async function getAddableJobOrdersForSpecialOrder(
  specialOrderId: string,
): Promise<JobOrderSpecialOrderPickerOption[]> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return [];

  const supabase = createAdminClient();
  const [roster, members] = await Promise.all([
    loadJobOrdersForSpecialOrder(supabase),
    loadSpecialOrderMembers(supabase, specialOrderId),
  ]);

  const taken = new Set(
    members
      .map((m) => m.job_order_employee_id)
      .filter((v): v is string => v != null),
  );
  return roster.filter((jo) => !taken.has(jo.id));
}

// ── Writes ───────────────────────────────────────────────────────────

export async function createJobOrderSpecialOrder(
  input: JobOrderSpecialOrderCreateValues,
): Promise<{ data?: { id: string }; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const parsed = jobOrderSpecialOrderCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid special order data",
    };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  const roster = await loadJobOrdersForSpecialOrder(supabase, {
    ids: v.employee_ids,
  });
  if (roster.length === 0) {
    return { error: "None of the selected employees are active Job Orders" };
  }

  const { data: created, error } = await supabase
    .schema("hris")
    .from("job_order_special_orders")
    .insert({
      so_no: v.so_no,
      subject: v.subject,
      so_date: v.so_date,
      period_covered: v.period_covered,
      created_by: user!.id,
      updated_by: user!.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const specialOrderId = (created as { id: string }).id;

  const { error: memErr } = await supabase
    .schema("hris")
    .from("job_order_special_order_members")
    .insert(
      roster.map((jo) => ({
        special_order_id: specialOrderId,
        ...toSpecialOrderMemberSnapshot(jo),
      })),
    );
  if (memErr) {
    await cleanupOrphanedSpecialOrder(supabase, specialOrderId);
    return { error: memErr.message };
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    tableName: "job_order_special_orders",
    recordId: specialOrderId,
    newValues: {
      so_no: v.so_no,
      subject: v.subject,
      members: roster.length,
    },
  });

  revalidatePath("/job-orders/special-orders");
  return { data: { id: specialOrderId } };
}

export async function updateJobOrderSpecialOrder(
  id: string,
  input: JobOrderSpecialOrderMetadataValues,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const parsed = jobOrderSpecialOrderMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid special order data",
    };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  // Only update a row that is actually there and not already deleted, so a
  // stale dialog cannot fabricate an audit entry for a phantom record.
  const { data: existing, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_special_orders")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!existing) return { error: "Special order not found" };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_special_orders")
    .update({
      so_no: v.so_no,
      subject: v.subject,
      so_date: v.so_date,
      period_covered: v.period_covered,
      updated_by: user!.id,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_special_orders",
    recordId: id,
    newValues: v as unknown as Record<string, unknown>,
  });

  revalidatePath("/job-orders/special-orders");
  revalidatePath(`/job-orders/special-orders/${id}`);
  return { success: true };
}

/**
 * Clone a Special Order's member snapshots into a new order under a new
 * heading.
 *
 * Names and area assignments come from the SOURCE order, not from the current
 * roster: duplicating an issued document must reproduce what it said, and
 * anything that has since changed is corrected on the copy.
 */
export async function duplicateJobOrderSpecialOrder(
  sourceId: string,
  metadata: JobOrderSpecialOrderDuplicateValues,
): Promise<{ data?: { id: string }; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const parsed = jobOrderSpecialOrderDuplicateSchema.safeParse(metadata);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid special order data",
    };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  const { data: src, error: srcErr } = await supabase
    .schema("hris")
    .from("job_order_special_orders")
    .select("id")
    .eq("id", sourceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (srcErr) return { error: srcErr.message };
  if (!src) return { error: "Source special order not found" };

  const srcMembers = await loadSpecialOrderMembers(supabase, sourceId);

  const { data: created, error } = await supabase
    .schema("hris")
    .from("job_order_special_orders")
    .insert({
      so_no: v.so_no,
      subject: v.subject,
      so_date: v.so_date,
      period_covered: v.period_covered,
      created_by: user!.id,
      updated_by: user!.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const newId = (created as { id: string }).id;

  if (srcMembers.length > 0) {
    const { error: memErr } = await supabase
      .schema("hris")
      .from("job_order_special_order_members")
      .insert(
        srcMembers.map((m) => ({
          special_order_id: newId,
          job_order_employee_id: m.job_order_employee_id,
          full_name: m.full_name,
          area_assigned: m.area_assigned,
        })),
      );
    if (memErr) {
      await cleanupOrphanedSpecialOrder(supabase, newId);
      return { error: memErr.message };
    }
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "duplicate",
    tableName: "job_order_special_orders",
    recordId: newId,
    newValues: { source_id: sourceId, members: srcMembers.length },
  });

  revalidatePath("/job-orders/special-orders");
  return { data: { id: newId } };
}

/** Soft delete. Members are left in place; the order simply stops being read. */
export async function deleteJobOrderSpecialOrder(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { data: existing, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_special_orders")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!existing) return { error: "Special order not found" };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_special_orders")
    .update({ deleted_at: new Date().toISOString(), updated_by: user!.id })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    tableName: "job_order_special_orders",
    recordId: id,
  });

  revalidatePath("/job-orders/special-orders");
  return { success: true };
}

// ── Members ──────────────────────────────────────────────────────────

export async function addJobOrderSpecialOrderMembers(
  specialOrderId: string,
  employeeIds: string[],
): Promise<{ data?: { added: number }; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };
  if (employeeIds.length === 0) return { error: "Select at least one employee" };

  const supabase = createAdminClient();
  const { data: so, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_special_orders")
    .select("id")
    .eq("id", specialOrderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!so) return { error: "Special order not found" };

  const roster = await loadJobOrdersForSpecialOrder(supabase, {
    ids: employeeIds,
  });
  if (roster.length === 0) {
    return { error: "None of the selected employees are active Job Orders" };
  }

  // ignoreDuplicates against uq_job_order_special_order_members, so re-adding
  // somebody already listed is a no-op rather than a raw 23505 in the user's
  // face.
  const { error } = await supabase
    .schema("hris")
    .from("job_order_special_order_members")
    .upsert(
      roster.map((jo) => ({
        special_order_id: specialOrderId,
        ...toSpecialOrderMemberSnapshot(jo),
      })),
      {
        onConflict: "special_order_id,job_order_employee_id",
        ignoreDuplicates: true,
      },
    );
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "add_members",
    tableName: "job_order_special_orders",
    recordId: specialOrderId,
    newValues: { added: roster.length },
  });

  revalidatePath("/job-orders/special-orders");
  revalidatePath(`/job-orders/special-orders/${specialOrderId}`);
  return { data: { added: roster.length } };
}

export async function updateJobOrderSpecialOrderMember(
  memberId: string,
  input: JobOrderSpecialOrderMemberValues,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const parsed = jobOrderSpecialOrderMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid member data" };
  }

  const supabase = createAdminClient();
  const { data: member, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_special_order_members")
    .select("id, special_order_id")
    .eq("id", memberId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!member) return { error: "Member not found" };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_special_order_members")
    .update({ area_assigned: parsed.data.area_assigned })
    .eq("id", memberId);
  if (error) return { error: error.message };

  const specialOrderId = (member as { special_order_id: string })
    .special_order_id;
  revalidatePath(`/job-orders/special-orders/${specialOrderId}`);
  return { success: true };
}

export async function removeJobOrderSpecialOrderMember(
  memberId: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { data: member, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_special_order_members")
    .select("id, special_order_id, full_name")
    .eq("id", memberId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!member) return { error: "Member not found" };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_special_order_members")
    .delete()
    .eq("id", memberId);
  if (error) return { error: error.message };

  const row = member as { special_order_id: string; full_name: string };
  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "remove_member",
    tableName: "job_order_special_orders",
    recordId: row.special_order_id,
    oldValues: { full_name: row.full_name },
  });

  revalidatePath("/job-orders/special-orders");
  revalidatePath(`/job-orders/special-orders/${row.special_order_id}`);
  return { success: true };
}

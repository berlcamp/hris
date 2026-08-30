"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  JOB_ORDER_MEMO_MAX_PAGE_SIZE,
  JOB_ORDER_MEMO_PAGE_SIZE,
  MEMO_SELECT,
  loadJobOrdersForMemo,
  loadMemoMembers,
  toMemoMemberSnapshot,
} from "@/lib/job-order-memo-repo";
import {
  jobOrderMemoCreateSchema,
  jobOrderMemoDuplicateSchema,
  jobOrderMemoMemberSchema,
  jobOrderMemoMetadataSchema,
  type JobOrderMemoCreateValues,
  type JobOrderMemoDuplicateValues,
  type JobOrderMemoMemberValues,
  type JobOrderMemoMetadataValues,
} from "@/lib/validations/job-order-memo-schema";
import { buildIlikeOrFilter } from "@/lib/postgrest-filters";
import type {
  JobOrderMemo,
  JobOrderMemoMember,
  JobOrderMemoPickerOption,
} from "@/lib/types";

// The page-size constants live in job-order-memo-repo.ts, not here: a
// `"use server"` module may only export async functions, so a plain
// `export const` in this file is a build error — and the list client needs the
// same number to compute its page count.

/**
 * Deletes a just-created memo whose member insert failed, so a zero-member
 * memo isn't stranded. Logged rather than thrown: the caller already has the
 * original error to surface and must still return it.
 */
async function cleanupOrphanedMemo(
  supabase: ReturnType<typeof createAdminClient>,
  memoId: string,
): Promise<void> {
  const { error } = await supabase
    .schema("hris")
    .from("job_order_memos")
    .delete()
    .eq("id", memoId);
  if (error) {
    console.error(
      `cleanupOrphanedMemo: failed to delete orphaned memo ${memoId}: ${error.message}`,
    );
  }
}

/** Member counts for a page of memos, in one round trip. */
async function countMembers(
  supabase: ReturnType<typeof createAdminClient>,
  memoIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (memoIds.length === 0) return counts;

  // Paged for the same reason getJobOrderPayrolls pages its member read: a
  // page of 20 memos each covering a large slice of the roster can exceed
  // PostgREST's 1000-row cap, and a silent truncation would zero the counts of
  // whichever memos land past the cut. `.order("memo_id")` keeps the page
  // boundaries stable across requests.
  const CHUNK = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_memo_members")
      .select("memo_id")
      .in("memo_id", memoIds)
      .order("memo_id")
      .range(from, from + CHUNK - 1);
    if (error) throw error;

    const rows = (data ?? []) as { memo_id: string }[];
    for (const r of rows) counts.set(r.memo_id, (counts.get(r.memo_id) ?? 0) + 1);
    if (rows.length < CHUNK) break;
    from += CHUNK;
  }

  return counts;
}

// ── Reads ────────────────────────────────────────────────────────────

export interface JobOrderMemoFilters {
  type?: "new" | "retain" | "all";
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export async function getJobOrderMemos(
  filters: JobOrderMemoFilters = {},
): Promise<{ rows: JobOrderMemo[]; totalCount: number }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { rows: [], totalCount: 0 };

  const supabase = createAdminClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    JOB_ORDER_MEMO_MAX_PAGE_SIZE,
    Math.max(1, filters.pageSize ?? JOB_ORDER_MEMO_PAGE_SIZE),
  );
  const from = (page - 1) * pageSize;

  let query = supabase
    .schema("hris")
    .from("job_order_memos")
    .select(MEMO_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order("memo_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.type && filters.type !== "all") {
    query = query.eq("memo_type", filters.type);
  }
  if (filters.dateFrom) query = query.gte("memo_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("memo_date", filters.dateTo);
  if (filters.search?.trim()) {
    // buildIlikeOrFilter, not a hand-built `.or(...)`: a comma or parenthesis
    // in the term would otherwise become a PostgREST 400.
    query = query.or(
      buildIlikeOrFilter(
        ["subject", "memo_no", "period_covered"],
        filters.search.trim(),
      ),
    );
  }

  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw error;
  if (!data || data.length === 0) return { rows: [], totalCount: count ?? 0 };

  const ids = data.map((r) => (r as { id: string }).id);
  const counts = await countMembers(supabase, ids);

  const rows: JobOrderMemo[] = data.map((raw) => {
    const m = raw as unknown as JobOrderMemo;
    return { ...m, member_count: counts.get(m.id) ?? 0 };
  });

  return { rows, totalCount: count ?? 0 };
}

export async function getJobOrderMemoById(id: string): Promise<{
  memo: JobOrderMemo | null;
  members: JobOrderMemoMember[];
}> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { memo: null, members: [] };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_memos")
    .select(MEMO_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { memo: null, members: [] };

  const members = await loadMemoMembers(supabase, id);

  return {
    memo: {
      ...(data as unknown as JobOrderMemo),
      member_count: members.length,
    },
    members,
  };
}

/** Every active Job Order employee, for the create dialog's picker. */
export async function getJobOrdersForMemoPicker(): Promise<
  JobOrderMemoPickerOption[]
> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return [];

  const supabase = createAdminClient();
  return loadJobOrdersForMemo(supabase);
}

/** Active Job Order employees not already listed on this memo. */
export async function getAddableJobOrdersForMemo(
  memoId: string,
): Promise<JobOrderMemoPickerOption[]> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return [];

  const supabase = createAdminClient();
  const [roster, members] = await Promise.all([
    loadJobOrdersForMemo(supabase),
    loadMemoMembers(supabase, memoId),
  ]);

  const taken = new Set(
    members
      .map((m) => m.job_order_employee_id)
      .filter((v): v is string => v != null),
  );
  return roster.filter((jo) => !taken.has(jo.id));
}

// ── Writes ───────────────────────────────────────────────────────────

export async function createJobOrderMemo(
  input: JobOrderMemoCreateValues,
): Promise<{ data?: { id: string }; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const parsed = jobOrderMemoCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid memo data" };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  const roster = await loadJobOrdersForMemo(supabase, { ids: v.employee_ids });
  if (roster.length === 0) {
    return { error: "None of the selected employees are active Job Orders" };
  }

  const { data: created, error } = await supabase
    .schema("hris")
    .from("job_order_memos")
    .insert({
      memo_no: v.memo_no,
      memo_type: v.memo_type,
      subject: v.subject,
      memo_date: v.memo_date,
      period_covered: v.period_covered,
      created_by: user!.id,
      updated_by: user!.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const memoId = (created as { id: string }).id;

  const { error: memErr } = await supabase
    .schema("hris")
    .from("job_order_memo_members")
    .insert(
      roster.map((jo) => ({ memo_id: memoId, ...toMemoMemberSnapshot(jo) })),
    );
  if (memErr) {
    await cleanupOrphanedMemo(supabase, memoId);
    return { error: memErr.message };
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    tableName: "job_order_memos",
    recordId: memoId,
    newValues: {
      memo_no: v.memo_no,
      memo_type: v.memo_type,
      subject: v.subject,
      members: roster.length,
    },
  });

  revalidatePath("/job-orders/memos");
  return { data: { id: memoId } };
}

export async function updateJobOrderMemo(
  id: string,
  input: JobOrderMemoMetadataValues,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const parsed = jobOrderMemoMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid memo data" };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  // Only update a row that is actually there and not already deleted, so a
  // stale dialog cannot fabricate an audit entry for a phantom record.
  const { data: existing, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_memos")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!existing) return { error: "Memo not found" };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_memos")
    .update({
      memo_no: v.memo_no,
      memo_type: v.memo_type,
      subject: v.subject,
      memo_date: v.memo_date,
      period_covered: v.period_covered,
      updated_by: user!.id,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_memos",
    recordId: id,
    newValues: v as unknown as Record<string, unknown>,
  });

  revalidatePath("/job-orders/memos");
  revalidatePath(`/job-orders/memos/${id}`);
  return { success: true };
}

/**
 * Clone a memo's member snapshots into a new memo under a new heading.
 *
 * Names, office assignments and rates come from the SOURCE memo, not from the
 * current roster: duplicating an issued document must reproduce what it said,
 * and anything that has since changed is corrected on the copy. `memo_type`
 * is inherited — the copy is the same template, so it is read off the source
 * rather than taken from the caller.
 */
export async function duplicateJobOrderMemo(
  sourceId: string,
  metadata: JobOrderMemoDuplicateValues,
): Promise<{ data?: { id: string }; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const parsed = jobOrderMemoDuplicateSchema.safeParse(metadata);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid memo data" };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  const { data: src, error: srcErr } = await supabase
    .schema("hris")
    .from("job_order_memos")
    .select("id, memo_type")
    .eq("id", sourceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (srcErr) return { error: srcErr.message };
  if (!src) return { error: "Source memo not found" };

  const srcMembers = await loadMemoMembers(supabase, sourceId);

  const { data: created, error } = await supabase
    .schema("hris")
    .from("job_order_memos")
    .insert({
      memo_no: v.memo_no,
      memo_type: (src as { memo_type: string }).memo_type,
      subject: v.subject,
      memo_date: v.memo_date,
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
      .from("job_order_memo_members")
      .insert(
        srcMembers.map((m) => ({
          memo_id: newId,
          job_order_employee_id: m.job_order_employee_id,
          full_name: m.full_name,
          office_assignment: m.office_assignment,
          daily_rate: m.daily_rate,
        })),
      );
    if (memErr) {
      await cleanupOrphanedMemo(supabase, newId);
      return { error: memErr.message };
    }
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "duplicate",
    tableName: "job_order_memos",
    recordId: newId,
    newValues: { source_id: sourceId, members: srcMembers.length },
  });

  revalidatePath("/job-orders/memos");
  return { data: { id: newId } };
}

/** Soft delete. Members are left in place; the memo simply stops being read. */
export async function deleteJobOrderMemo(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { data: existing, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_memos")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!existing) return { error: "Memo not found" };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_memos")
    .update({ deleted_at: new Date().toISOString(), updated_by: user!.id })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    tableName: "job_order_memos",
    recordId: id,
  });

  revalidatePath("/job-orders/memos");
  return { success: true };
}

// ── Members ──────────────────────────────────────────────────────────

export async function addJobOrderMemoMembers(
  memoId: string,
  employeeIds: string[],
): Promise<{ data?: { added: number }; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };
  if (employeeIds.length === 0) return { error: "Select at least one employee" };

  const supabase = createAdminClient();
  const { data: memo, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_memos")
    .select("id")
    .eq("id", memoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!memo) return { error: "Memo not found" };

  const roster = await loadJobOrdersForMemo(supabase, { ids: employeeIds });
  if (roster.length === 0) {
    return { error: "None of the selected employees are active Job Orders" };
  }

  // ignoreDuplicates against uq_job_order_memo_members, so re-adding somebody
  // already listed is a no-op rather than a raw 23505 in the user's face.
  const { error } = await supabase
    .schema("hris")
    .from("job_order_memo_members")
    .upsert(
      roster.map((jo) => ({ memo_id: memoId, ...toMemoMemberSnapshot(jo) })),
      { onConflict: "memo_id,job_order_employee_id", ignoreDuplicates: true },
    );
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "add_members",
    tableName: "job_order_memos",
    recordId: memoId,
    newValues: { added: roster.length },
  });

  revalidatePath("/job-orders/memos");
  revalidatePath(`/job-orders/memos/${memoId}`);
  return { data: { added: roster.length } };
}

export async function updateJobOrderMemoMember(
  memberId: string,
  input: JobOrderMemoMemberValues,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const parsed = jobOrderMemoMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid member data" };
  }

  const supabase = createAdminClient();
  const { data: member, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_memo_members")
    .select("id, memo_id")
    .eq("id", memberId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!member) return { error: "Member not found" };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_memo_members")
    .update({
      office_assignment: parsed.data.office_assignment,
      daily_rate: parsed.data.daily_rate,
    })
    .eq("id", memberId);
  if (error) return { error: error.message };

  const memoId = (member as { memo_id: string }).memo_id;
  revalidatePath(`/job-orders/memos/${memoId}`);
  return { success: true };
}

export async function removeJobOrderMemoMember(
  memberId: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { data: member, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_memo_members")
    .select("id, memo_id, full_name")
    .eq("id", memberId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!member) return { error: "Member not found" };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_memo_members")
    .delete()
    .eq("id", memberId);
  if (error) return { error: error.message };

  const row = member as { memo_id: string; full_name: string };
  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "remove_member",
    tableName: "job_order_memos",
    recordId: row.memo_id,
    oldValues: { full_name: row.full_name },
  });

  revalidatePath("/job-orders/memos");
  revalidatePath(`/job-orders/memos/${row.memo_id}`);
  return { success: true };
}

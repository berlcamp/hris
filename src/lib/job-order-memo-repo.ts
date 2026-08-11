/**
 * Plain (non-`"use server"`) database access for Job Order memos.
 *
 * Same split as job-order-payroll-repo.ts: everything here takes a live
 * Supabase client and does nothing else — no `getCurrentUser()`, no
 * `revalidatePath()`, no `logAudit()` — so it stays importable from
 * `supabase/tests/*.test.mts`, which Node's plain ESM loader cannot use on a
 * `"use server"` module.
 *
 * Relative imports WITH the .ts extension, not the `@/lib/...` alias, for the
 * same reason. Type-only `@/` imports are fine: they are erased.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import type { JobOrderMemoMember } from "@/lib/types";

export type MemoDbClient = ReturnType<typeof createAdminClient>;

/**
 * Rows per page for the memo list. Shared deliberately — the action uses it as
 * its default and the list client needs the same number to compute the page
 * count it renders. It lives here rather than in the action because a
 * `"use server"` module may only export async functions.
 */
export const JOB_ORDER_MEMO_PAGE_SIZE = 20;

/** Upper bound on a caller-supplied `pageSize`. */
export const JOB_ORDER_MEMO_MAX_PAGE_SIZE = 100;

/** supabase/config.toml caps PostgREST's max_rows at 1000. */
const PAGE_SIZE = 1000;

export const MEMO_SELECT = `
  id, memo_no, memo_type, subject, memo_date, period_covered,
  created_at, updated_at
`;

export const MEMO_MEMBER_SELECT = `
  id, memo_id, job_order_employee_id, full_name, office_assignment,
  daily_rate, created_at, updated_at
`;

// PostgREST serializes numeric(...) as a STRING to avoid float precision loss,
// so an unconverted daily_rate would sort and format as text.
export function toNumber(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/**
 * Every member of a memo, ordered by name — the order they print in.
 *
 * Paged with `.range()` because a memo can cover the whole active roster
 * (~578 rows today) and PostgREST is capped at 1000 per request; a silent
 * truncation would drop people off an issued document. `full_name` does not
 * uniquely order rows, so `id` is the tiebreaker that keeps page boundaries
 * stable.
 */
export async function loadMemoMembers(
  supabase: MemoDbClient,
  memoId: string,
): Promise<JobOrderMemoMember[]> {
  const collected: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_memo_members")
      .select(MEMO_MEMBER_SELECT)
      .eq("memo_id", memoId)
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = (data ?? []) as Record<string, unknown>[];
    collected.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return collected.map((r) => ({
    ...(r as unknown as JobOrderMemoMember),
    daily_rate: toNumber(r.daily_rate),
  }));
}

export interface MemoRosterRow {
  id: string;
  full_name: string;
  area_name: string | null;
  daily_rate: number | null;
}

/**
 * Active Job Order employees shaped for the memo picker and for snapshotting,
 * area flattened. Paged for the same reason as loadMemoMembers.
 */
export async function loadJobOrdersForMemo(
  supabase: MemoDbClient,
  where: { ids?: string[] } = {},
): Promise<MemoRosterRow[]> {
  const collected: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .schema("hris")
      .from("job_order_employees")
      .select("id, full_name, daily_rate, job_order_areas(name)")
      .eq("status", "active")
      .is("deleted_at", null);

    if (where.ids) query = query.in("id", where.ids);

    const { data, error } = await query
      .order("full_name")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = (data ?? []) as Record<string, unknown>[];
    collected.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return collected.map((r) => {
    const area = r.job_order_areas as { name: string } | null;
    return {
      id: r.id as string,
      full_name: r.full_name as string,
      area_name: area?.name ?? null,
      daily_rate: toNumber(r.daily_rate),
    };
  });
}

/** The frozen snapshot a roster row contributes to a memo. */
export function toMemoMemberSnapshot(jo: MemoRosterRow) {
  return {
    job_order_employee_id: jo.id,
    full_name: jo.full_name,
    office_assignment: jo.area_name,
    daily_rate: jo.daily_rate,
  };
}

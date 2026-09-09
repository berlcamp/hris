/**
 * Plain (non-`"use server"`) database access for Job Order Special Orders.
 *
 * Same split as job-order-memo-repo.ts: everything here takes a live Supabase
 * client and does nothing else — no `getCurrentUser()`, no `revalidatePath()`,
 * no `logAudit()` — so it stays importable from `supabase/tests/*.test.mts`,
 * which Node's plain ESM loader cannot use on a `"use server"` module.
 *
 * Relative imports WITH the .ts extension, not the `@/lib/...` alias, for the
 * same reason. Type-only `@/` imports are fine: they are erased.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import type { JobOrderSpecialOrderMember } from "@/lib/types";

export type SpecialOrderDbClient = ReturnType<typeof createAdminClient>;

/**
 * Rows per page for the Special Order list. Shared deliberately — the action
 * uses it as its default and the list client needs the same number to compute
 * the page count it renders. It lives here rather than in the action because a
 * `"use server"` module may only export async functions.
 */
export const JOB_ORDER_SPECIAL_ORDER_PAGE_SIZE = 20;

/** Upper bound on a caller-supplied `pageSize`. */
export const JOB_ORDER_SPECIAL_ORDER_MAX_PAGE_SIZE = 100;

/** supabase/config.toml caps PostgREST's max_rows at 1000. */
const PAGE_SIZE = 1000;

export const SPECIAL_ORDER_SELECT = `
  id, so_no, subject, so_date, period_covered, created_at, updated_at
`;

export const SPECIAL_ORDER_MEMBER_SELECT = `
  id, special_order_id, job_order_employee_id, full_name, area_assigned,
  created_at, updated_at
`;

/**
 * Every member of a Special Order, ordered by name — the order they print in.
 *
 * Paged with `.range()` because an order can cover a large slice of the active
 * roster and PostgREST is capped at 1000 per request; a silent truncation
 * would drop people off an issued document. `full_name` does not uniquely
 * order rows, so `id` is the tiebreaker that keeps page boundaries stable.
 */
export async function loadSpecialOrderMembers(
  supabase: SpecialOrderDbClient,
  specialOrderId: string,
): Promise<JobOrderSpecialOrderMember[]> {
  const collected: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_special_order_members")
      .select(SPECIAL_ORDER_MEMBER_SELECT)
      .eq("special_order_id", specialOrderId)
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = (data ?? []) as Record<string, unknown>[];
    collected.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return collected as unknown as JobOrderSpecialOrderMember[];
}

export interface SpecialOrderRosterRow {
  id: string;
  full_name: string;
  area_name: string | null;
}

/**
 * Active Job Order employees shaped for the picker and for snapshotting, area
 * flattened. Paged for the same reason as loadSpecialOrderMembers.
 *
 * No daily_rate, unlike the memo's roster loader: the Special Order table
 * prints No. / NAMES / AREA ASSIGNED and nothing else, so a rate would be
 * dead weight in the snapshot.
 */
export async function loadJobOrdersForSpecialOrder(
  supabase: SpecialOrderDbClient,
  where: { ids?: string[] } = {},
): Promise<SpecialOrderRosterRow[]> {
  const collected: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .schema("hris")
      .from("job_order_employees")
      .select("id, full_name, job_order_areas(name)")
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
    };
  });
}

/** The frozen snapshot a roster row contributes to a Special Order. */
export function toSpecialOrderMemberSnapshot(jo: SpecialOrderRosterRow) {
  return {
    job_order_employee_id: jo.id,
    full_name: jo.full_name,
    area_assigned: jo.area_name,
  };
}

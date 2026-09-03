/**
 * Plain (non-`"use server"`) database-access layer for Job Order payrolls.
 *
 * Everything here takes a live Supabase client as its first argument and does
 * nothing else — no `getCurrentUser()`, no `revalidatePath()`, no `logAudit()`.
 * That is the whole point: `"use server"` modules import `next/cache` /
 * `next/headers`, which Node's plain ESM loader cannot resolve with no Next
 * bundler in the loop, so anything living in one is unreachable from
 * `supabase/tests/*.test.mts`. Two real-stack tests previously re-ran *copies*
 * of the `recomputeAreas` and chunked-upsert logic for exactly that reason;
 * they now import the real functions from here.
 *
 * Same reasoning as `job-order-payroll-guards.ts`, one layer down: guards hold
 * the authorization decisions, this holds the queries they guard.
 *
 * Relative imports WITH the .ts extension, not the `@/lib/...` alias — Node's
 * ESM resolver cannot resolve the alias and requires the extension.
 * `allowImportingTsExtensions` in tsconfig.json makes this equally valid for
 * the Next/tsc build. Type-only `@/` imports are fine: they are erased.
 */

import { deriveAreasLabel } from "./job-order-payroll-helpers.ts";
import {
  JO_SELECT_FOR_SNAPSHOT,
  MEMBER_SELECT,
  shapeMember,
  toNumber,
} from "./job-order-payroll-queries.ts";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { JobOrderEmployee, JobOrderPayrollMember } from "@/lib/types";

/**
 * The client every function here accepts. Named so tests can cast their own
 * `createClient(...)` handle to it in one place instead of at each call site.
 */
export type PayrollDbClient = ReturnType<typeof createAdminClient>;

/** supabase/config.toml caps PostgREST's max_rows at 1000. */
const PAGE_SIZE = 1000;

/**
 * Every member of a payroll, ordered by name.
 *
 * It used to come back by area then name, so the members table could band the
 * rows under area headings by walking the list. That table lists names flat
 * and alphabetically now — the order the printed payroll uses — and nothing
 * else ever wanted the area ordering (`deriveAreasLabel` sorts its own set,
 * and the printables re-sort through `paginateDailyWages`), so the area key
 * is gone rather than left as an ordering no caller reads.
 *
 * Paged with `.range()` in chunks of 1000 because supabase/config.toml caps
 * PostgREST's max_rows at 1000 — an area-picker payroll can snapshot ~578
 * active JOs today, and this result feeds mutations (duplicate), not just
 * display, so a silent
 * truncation here is worse than the same cap on a read-only list. Same
 * pattern as `loadJobOrdersForSnapshot` below. `full_name` does not uniquely
 * order rows, so `id` is appended as a tiebreaker to keep page boundaries
 * stable.
 */
export async function loadMembers(
  supabase: PayrollDbClient,
  payrollId: string,
): Promise<JobOrderPayrollMember[]> {
  const collected: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_payroll_members")
      .select(MEMBER_SELECT)
      .eq("payroll_id", payrollId)
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = (data ?? []) as Record<string, unknown>[];
    collected.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return collected.map((r) => shapeMember(r));
}

/** Recompute the denormalized `areas` label after any membership change. */
export async function recomputeAreas(
  supabase: PayrollDbClient,
  payrollId: string,
): Promise<void> {
  const members = await loadMembers(supabase, payrollId);
  const { error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .update({ areas: deriveAreasLabel(members) })
    .eq("id", payrollId);
  // Logged, not thrown: `areas` is a denormalized search/display label, not
  // the record of truth (members are). But a silent failure here leaves it
  // stale — and it's one of the three columns list search matches against
  // (see the `.or(...)` in getJobOrderPayrolls) — so a failure must at least
  // be visible for someone to notice and re-run.
  if (error) {
    console.error(
      `recomputeAreas: failed to update areas for payroll ${payrollId}: ${error.message}`,
    );
  }
}

/**
 * Roster rows shaped for snapshotting. Numerics converted; area flattened.
 *
 * Paged with .range() in chunks of 1000 because supabase/config.toml caps
 * PostgREST's max_rows at 1000. An unpaginated select would silently truncate
 * once the roster passes that — it is ~578 rows today. `getAddableJobOrders`
 * calls this with no filter at all, so it is the first caller that would hit
 * the cap. Same pattern and same reason as job-order-actions.ts:104.
 * `full_name` does not uniquely order rows, so `id` is the tiebreaker that
 * keeps page boundaries stable.
 */
export async function loadJobOrdersForSnapshot(
  supabase: PayrollDbClient,
  where: { areaIds?: string[]; ids?: string[] },
): Promise<JobOrderEmployee[]> {
  const collected: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .schema("hris")
      .from("job_order_employees")
      .select(JO_SELECT_FOR_SNAPSHOT)
      .eq("status", "active")
      .is("deleted_at", null);

    if (where.areaIds) query = query.in("area_id", where.areaIds);
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

  return collected.map((raw) => {
    const r = raw as Record<string, unknown>;
    const area = r.job_order_areas as { name: string } | null;
    const { job_order_areas: _drop, ...rest } = r;
    return {
      ...(rest as unknown as JobOrderEmployee),
      area_name: area?.name ?? null,
      daily_rate: toNumber(r.daily_rate),
      previous_daily_rate: toNumber(r.previous_daily_rate),
      sss_ss: toNumber(r.sss_ss),
      sss_ec: toNumber(r.sss_ec),
    };
  });
}

// ---------------------------------------------------------------------------
// Legacy import writes
// ---------------------------------------------------------------------------

/** Chunk size for the legacy importer's upserts. */
export const UPSERT_CHUNK = 500;

export interface LegacyUpsertOutcome {
  /** Rows PostgREST reported as actually inserted, in insertion order. */
  returned: { id?: string; legacy_id: number }[];
  /** One entry per failed chunk. Empty on a clean run. */
  warnings: string[];
}

/**
 * Insert `rows` in chunks, skipping any row whose `legacy_id` already exists,
 * and isolating a failed chunk instead of aborting the whole import.
 *
 * Two properties this exists to hold, both load-bearing:
 *
 *  1. `ignoreDuplicates: true` makes this insert-or-skip, never overwrite. A
 *     migrated payroll is an issued government record; a second run of the
 *     importer must never re-price it at whatever the roster says months
 *     later (I3 in the final review). The caller also pre-filters existing
 *     `legacy_id`s in JS — this is the belt-and-suspenders half, and the only
 *     half that holds against a concurrent import racing for the same id.
 *  2. On error the chunk is reported and skipped, not rethrown. One bad row
 *     can therefore drop up to `UPSERT_CHUNK - 1` valid neighbours behind a
 *     single warning line, but the rest of the import still lands. That
 *     trade-off is deliberate and is covered by a real-stack test.
 *
 * `noun` is interpolated as `${noun}(s)` into the warning message, so pass
 * "payroll" or "payroll member".
 */
export async function upsertLegacyChunks<Row extends { legacy_id: number }>(
  supabase: PayrollDbClient,
  table: "job_order_payrolls" | "job_order_payroll_members",
  rows: Row[],
  options: { noun: string; select: string; chunkSize?: number },
): Promise<LegacyUpsertOutcome> {
  const chunkSize = options.chunkSize ?? UPSERT_CHUNK;
  const returned: { id?: string; legacy_id: number }[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .schema("hris")
      .from(table)
      .upsert(chunk, { onConflict: "legacy_id", ignoreDuplicates: true })
      .select(options.select);

    if (error) {
      warnings.push(
        `Failed to save a batch of ${chunk.length} ${options.noun}(s) (legacy_id ${chunk[0]?.legacy_id}..${chunk[chunk.length - 1]?.legacy_id}): ${error.message}`,
      );
      continue;
    }

    returned.push(
      ...((data ?? []) as unknown as { id?: string; legacy_id: number }[]),
    );
  }

  return { returned, warnings };
}

/**
 * `legacy_id -> id` for every row of `table` whose `legacy_id` is in
 * `legacyIds`. Used two ways: to decide which rows to SKIP on a re-run (I3 —
 * a migrated payroll must never be rewritten at whatever the roster says
 * later), and, for payrolls specifically, to resolve member rows' parent FK
 * even when that parent payroll already existed and was skipped this run
 * rather than freshly inserted.
 */
export async function loadExistingLegacyIdMap(
  supabase: PayrollDbClient,
  table: "job_order_payrolls" | "job_order_payroll_members",
  legacyIds: number[],
): Promise<Map<number, string>> {
  const found = new Map<number, string>();
  for (let i = 0; i < legacyIds.length; i += UPSERT_CHUNK) {
    const slice = legacyIds.slice(i, i + UPSERT_CHUNK);
    if (slice.length === 0) continue;
    const { data, error } = await supabase
      .schema("hris")
      .from(table)
      .select("id, legacy_id")
      .in("legacy_id", slice);
    if (error) {
      throw new Error(
        `Failed to check existing ${table} legacy_id values: ${error.message}`,
      );
    }
    for (const row of (data ?? []) as { id: string; legacy_id: number | null }[]) {
      if (row.legacy_id != null) found.set(row.legacy_id, row.id);
    }
  }
  return found;
}

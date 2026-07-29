"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  deriveAreasLabel,
  summarizeMembers,
  toPayrollMemberSnapshot,
} from "@/lib/job-order-payroll-helpers";
import {
  assertDraft,
  canReopenOrDeletePayroll,
} from "@/lib/job-order-payroll-guards";
import {
  jobOrderPayrollCreateSchema,
  jobOrderPayrollMetadataSchema,
  type JobOrderPayrollCreateValues,
  type JobOrderPayrollMetadataValues,
} from "@/lib/validations/job-order-payroll-schema";
import {
  JO_SELECT_FOR_SNAPSHOT,
  MEMBER_SELECT,
  PAYROLL_SELECT,
  shapeMember,
  toNumber,
} from "@/lib/job-order-payroll-queries";
import type {
  JobOrderAreaOption,
  JobOrderEmployee,
  JobOrderPayroll,
  JobOrderPayrollMember,
} from "@/lib/types";

/**
 * Every member of a payroll, ordered by area then name.
 *
 * Paged with `.range()` in chunks of 1000 because supabase/config.toml caps
 * PostgREST's max_rows at 1000 — an area-picker payroll can snapshot ~578
 * active JOs today, and this result feeds mutations (duplicate, finalize's
 * empty-check, refreshMembersFromRoster), not just display, so a silent
 * truncation here is worse than the same cap on a read-only list. Same
 * pattern as `loadJobOrdersForSnapshot` below. `area_name`/`full_name` do not
 * uniquely order rows, so `id` is appended as a tiebreaker to keep page
 * boundaries stable — the members table relies on the area/name ordering
 * itself to group rows when it walks the list, so that ordering must not
 * change.
 */
export async function loadMembers(
  supabase: ReturnType<typeof createAdminClient>,
  payrollId: string,
): Promise<JobOrderPayrollMember[]> {
  const PAGE_SIZE = 1000;
  const collected: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_payroll_members")
      .select(MEMBER_SELECT)
      .eq("payroll_id", payrollId)
      .order("area_name", { ascending: true, nullsFirst: false })
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
  supabase: ReturnType<typeof createAdminClient>,
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
 * Deletes a just-created payroll row after its member insert failed, so a
 * zero-member draft isn't left stranded (finalizeJobOrderPayroll refuses to
 * finalize an empty payroll, so it would otherwise sit inert forever with no
 * normal-use path to clean it up). Logged, not thrown: the caller already has
 * the original insert error to surface and must still return it.
 */
async function cleanupOrphanedPayroll(
  supabase: ReturnType<typeof createAdminClient>,
  payrollId: string,
): Promise<void> {
  const { error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .delete()
    .eq("id", payrollId);
  if (error) {
    console.error(
      `cleanupOrphanedPayroll: failed to delete orphaned payroll ${payrollId}: ${error.message}`,
    );
  }
}

// `assertDraft` (the shared draft guard used below and by
// job-order-payroll-member-actions.ts) now lives in the plain,
// non-`"use server"` `@/lib/job-order-payroll-guards` module so its decision
// logic can be unit-tested without a Supabase client — see
// supabase/tests/job-order-payroll-guards.test.mts. Imported at the top of
// this file.

// ── Reads ────────────────────────────────────────────────────────────

/**
 * Quotes a value for embedding inside a PostgREST `.or(...)` filter string.
 * PostgREST splits `.or()`'s argument on top-level commas, so an unquoted
 * search term containing a comma (e.g. "Ozamiz, Area 1" — plausible here
 * since `areas` is itself a comma-joined label) breaks into two invalid
 * filter fragments and PostgREST returns a 400. Wrapping the value in double
 * quotes protects any embedded comma, and `\`/`"` inside it must in turn be
 * backslash-escaped so they aren't read as the closing quote.
 */
function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export interface JobOrderPayrollFilters {
  status?: "draft" | "finalized" | "all";
  periodFrom?: string | null;
  periodTo?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

/**
 * Server-side pagination, unlike the Spec 1 roster which paginates inside
 * <DataTable>. This table starts at ~805 migrated payrolls and grows every
 * cutoff, so shipping every row to the browser is not viable.
 */
export async function getJobOrderPayrolls(
  filters: JobOrderPayrollFilters = {},
): Promise<{ rows: JobOrderPayroll[]; totalCount: number }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { rows: [], totalCount: 0 };

  const supabase = createAdminClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const from = (page - 1) * pageSize;

  let query = supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select(PAYROLL_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order("period_start", { ascending: false })
    .order("period_end", { ascending: false });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.periodFrom) query = query.gte("period_end", filters.periodFrom);
  if (filters.periodTo) query = query.lte("period_start", filters.periodTo);
  if (filters.search?.trim()) {
    const term = esc(`%${filters.search.trim()}%`);
    query = query.or(
      `description.ilike."${term}",particulars.ilike."${term}",areas.ilike."${term}"`,
    );
  }

  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw error;
  if (!data || data.length === 0) return { rows: [], totalCount: count ?? 0 };

  const ids = data.map((r) => (r as { id: string }).id);

  // Paged with `.range()` in chunks of 1000 because supabase/config.toml caps
  // PostgREST's max_rows at 1000. A page of 20 payrolls, each snapshotting an
  // area's full active roster (~578 people today), can easily exceed 1000
  // member rows combined — an unpaginated `.in("payroll_id", ids)` would
  // silently return only the first 1000, zeroing `member_count`/totals for
  // whichever payrolls' rows land past the cut with no error at all.
  // `.order("payroll_id")` makes the page boundaries stable across requests;
  // without it Postgres is free to return the 1000 rows in a different order
  // each time, so a different payroll gets truncated on every reload.
  const MEMBER_PAGE_SIZE = 1000;
  const members: Record<string, unknown>[] = [];
  let memberFrom = 0;
  for (;;) {
    const { data: batch, error: memErr } = await supabase
      .schema("hris")
      .from("job_order_payroll_members")
      .select("payroll_id, daily_rate, days, sss_ss, sss_ec")
      .in("payroll_id", ids)
      .order("payroll_id")
      .range(memberFrom, memberFrom + MEMBER_PAGE_SIZE - 1);
    if (memErr) throw memErr;

    const rows = batch ?? [];
    members.push(...rows);
    if (rows.length < MEMBER_PAGE_SIZE) break;
    memberFrom += MEMBER_PAGE_SIZE;
  }

  const byPayroll = new Map<
    string,
    { rate: number | null; days: number | null; sss_ss: number | null; sss_ec: number | null }[]
  >();
  for (const m of members) {
    const row = m as Record<string, unknown>;
    const key = row.payroll_id as string;
    const list = byPayroll.get(key) ?? [];
    list.push({
      rate: toNumber(row.daily_rate),
      days: toNumber(row.days),
      sss_ss: toNumber(row.sss_ss),
      sss_ec: toNumber(row.sss_ec),
    });
    byPayroll.set(key, list);
  }

  const rows: JobOrderPayroll[] = data.map((raw) => {
    const p = raw as unknown as JobOrderPayroll;
    const list = byPayroll.get(p.id) ?? [];
    const totals = summarizeMembers(list);
    return {
      ...p,
      days: toNumber((raw as Record<string, unknown>).days),
      member_count: list.length,
      total_gross: totals.gross,
      total_sss: totals.sss,
      total_net: totals.net,
    };
  });

  return { rows, totalCount: count ?? 0 };
}

export async function getJobOrderPayrollById(id: string): Promise<{
  payroll: JobOrderPayroll | null;
  members: JobOrderPayrollMember[];
}> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { payroll: null, members: [] };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select(PAYROLL_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { payroll: null, members: [] };

  const members = await loadMembers(supabase, id);
  const totals = summarizeMembers(
    members.map((m) => ({
      rate: m.daily_rate,
      days: m.days,
      sss_ss: m.sss_ss,
      sss_ec: m.sss_ec,
    })),
  );

  return {
    payroll: {
      ...(data as unknown as JobOrderPayroll),
      days: toNumber((data as Record<string, unknown>).days),
      member_count: members.length,
      total_gross: totals.gross,
      total_sss: totals.sss,
      total_net: totals.net,
    },
    members,
  };
}

export async function getJobOrderAreasForPicker(): Promise<JobOrderAreaOption[]> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return [];

  const supabase = createAdminClient();
  const { data: areas, error } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .select("id, name")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;

  const { data: emps, error: empErr } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .select("area_id")
    .eq("status", "active")
    .is("deleted_at", null);
  if (empErr) throw empErr;

  const counts = new Map<string, number>();
  for (const e of emps ?? []) {
    const key = (e as { area_id: string }).area_id;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (areas ?? []).map((a) => {
    const area = a as { id: string; name: string };
    return {
      id: area.id,
      name: area.name,
      active_employee_count: counts.get(area.id) ?? 0,
    };
  });
}

// ── Writes ───────────────────────────────────────────────────────────

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
  supabase: ReturnType<typeof createAdminClient>,
  where: { areaIds?: string[]; ids?: string[] },
): Promise<JobOrderEmployee[]> {
  const PAGE_SIZE = 1000;
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

export async function createJobOrderPayroll(
  input: JobOrderPayrollCreateValues,
): Promise<{ data?: { id: string }; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderPayrollCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Invalid payroll data",
    };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  const roster = await loadJobOrdersForSnapshot(supabase, {
    areaIds: v.area_ids,
  });
  if (roster.length === 0) {
    return { error: "The selected areas have no active Job Order employees" };
  }

  const { data: created, error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .insert({
      period_start: v.period_start,
      period_end: v.period_end,
      days: v.days,
      description: v.description,
      particulars: v.particulars,
      payroll_date: v.payroll_date,
      status: "draft",
      created_by: user!.id,
      updated_by: user!.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const payrollId = (created as { id: string }).id;

  // Members inherit the payroll's `days` (10,971 of 11,015 legacy member rows
  // carry one); `hours` starts NULL because overtime is the exception — only
  // 83 legacy rows have it.
  const rows = roster.map((jo) => ({
    payroll_id: payrollId,
    job_order_employee_id: jo.id,
    days: v.days,
    hours: null,
    ...toPayrollMemberSnapshot(jo),
  }));

  const { error: memErr } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .insert(rows);
  if (memErr) {
    // Leave no half-built payroll behind.
    await cleanupOrphanedPayroll(supabase, payrollId);
    return { error: memErr.message };
  }

  await recomputeAreas(supabase, payrollId);

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    tableName: "job_order_payrolls",
    recordId: payrollId,
    newValues: { period: `${v.period_start}..${v.period_end}`, members: rows.length },
  });

  revalidatePath("/job-orders/payroll");
  return { data: { id: payrollId } };
}

export async function updateJobOrderPayroll(
  id: string,
  input: JobOrderPayrollMetadataValues,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderPayrollMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payroll data" };
  }

  const supabase = createAdminClient();
  const blocked = await assertDraft(supabase, id);
  if (blocked) return { error: blocked };

  const v = parsed.data;
  const { error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .update({
      period_start: v.period_start,
      period_end: v.period_end,
      days: v.days,
      description: v.description,
      particulars: v.particulars,
      payroll_date: v.payroll_date,
      updated_by: user!.id,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_payrolls",
    recordId: id,
    newValues: v as unknown as Record<string, unknown>,
  });

  revalidatePath("/job-orders/payroll");
  revalidatePath(`/job-orders/payroll/${id}`);
  return { success: true };
}

/**
 * Clone a payroll's member snapshots into a new draft for a new period. Rates
 * come from the SOURCE payroll, not the roster, so duplicating is
 * reproducible; "Refresh from roster" is the explicit way to pull current
 * values.
 */
export async function duplicateJobOrderPayroll(
  sourceId: string,
  metadata: JobOrderPayrollMetadataValues,
): Promise<{ data?: { id: string }; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderPayrollMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payroll data" };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  const { data: src, error: srcErr } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select("id, particulars, description")
    .eq("id", sourceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (srcErr) return { error: srcErr.message };
  if (!src) return { error: "Source payroll not found" };

  const srcMembers = await loadMembers(supabase, sourceId);

  const { data: created, error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .insert({
      period_start: v.period_start,
      period_end: v.period_end,
      days: v.days,
      description:
        v.description ?? (src as { description: string | null }).description,
      particulars:
        v.particulars ?? (src as { particulars: string | null }).particulars,
      payroll_date: v.payroll_date,
      status: "draft",
      created_by: user!.id,
      updated_by: user!.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const newId = (created as { id: string }).id;

  if (srcMembers.length > 0) {
    const rows = srcMembers.map((m) => ({
      payroll_id: newId,
      job_order_employee_id: m.job_order_employee_id,
      // New period, so days resets to the new payroll's default and overtime
      // starts clean — carrying either across would silently re-pay it.
      days: v.days,
      hours: null,
      full_name: m.full_name,
      area_name: m.area_name,
      sub_area: m.sub_area,
      daily_rate: m.daily_rate,
      sss_no: m.sss_no,
      sss_ss: m.sss_ss,
      sss_ec: m.sss_ec,
      has_atm: m.has_atm,
      landbank_account_number: m.landbank_account_number,
      community_tax_number: m.community_tax_number,
      community_tax_date: m.community_tax_date,
      community_tax_place_issued: m.community_tax_place_issued,
    }));
    const { error: memErr } = await supabase
      .schema("hris")
      .from("job_order_payroll_members")
      .insert(rows);
    if (memErr) {
      await cleanupOrphanedPayroll(supabase, newId);
      return { error: memErr.message };
    }
  }

  await recomputeAreas(supabase, newId);

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "duplicate",
    tableName: "job_order_payrolls",
    recordId: newId,
    newValues: { source_id: sourceId, members: srcMembers.length },
  });

  revalidatePath("/job-orders/payroll");
  return { data: { id: newId } };
}

export async function finalizeJobOrderPayroll(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const blocked = await assertDraft(supabase, id);
  if (blocked) return { error: blocked };

  const members = await loadMembers(supabase, id);
  if (members.length === 0) {
    return { error: "Cannot finalize a payroll with no members" };
  }

  const { error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .update({
      status: "finalized",
      finalized_at: new Date().toISOString(),
      finalized_by: user!.id,
      updated_by: user!.id,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "finalize",
    tableName: "job_order_payrolls",
    recordId: id,
    newValues: { members: members.length },
  });

  revalidatePath("/job-orders/payroll");
  revalidatePath(`/job-orders/payroll/${id}`);
  return { success: true };
}

/** super_admin only. Unlocks an issued record, so it is audited explicitly. */
export async function reopenJobOrderPayroll(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canReopenOrDeletePayroll(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { data: current, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select("status, finalized_at, finalized_by")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!current) return { error: "Payroll not found" };
  if ((current as { status: string }).status !== "finalized") {
    return { error: "This payroll is already a draft" };
  }

  const { error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .update({
      status: "draft",
      finalized_at: null,
      finalized_by: null,
      updated_by: user!.id,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "reopen",
    tableName: "job_order_payrolls",
    recordId: id,
    oldValues: current as unknown as Record<string, unknown>,
  });

  revalidatePath("/job-orders/payroll");
  revalidatePath(`/job-orders/payroll/${id}`);
  return { success: true };
}

/** super_admin only, soft delete. */
export async function deleteJobOrderPayroll(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canReopenOrDeletePayroll(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  // Only soft-delete a row that is actually there and not already deleted, so
  // a stale row action cannot fabricate an audit entry for a phantom record —
  // the defect fixed for areas and employees in commit 891678f.
  const { data: existing, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!existing) return { error: "Payroll not found" };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .update({ deleted_at: new Date().toISOString(), updated_by: user!.id })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    tableName: "job_order_payrolls",
    recordId: id,
  });

  revalidatePath("/job-orders/payroll");
  return { success: true };
}

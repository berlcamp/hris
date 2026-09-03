"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import {
  canManageJobOrderPayroll,
  canManageJobOrders,
} from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  summarizeMembers,
  toPayrollMemberSnapshot,
} from "@/lib/job-order-payroll-helpers";
import {
  assertWritable,
  canDeletePayroll,
} from "@/lib/job-order-payroll-guards";
import {
  loadJobOrdersForSnapshot,
  loadMembers,
  recomputeAreas,
} from "@/lib/job-order-payroll-repo";
import {
  jobOrderPayrollCreateSchema,
  jobOrderPayrollMetadataSchema,
  type JobOrderPayrollCreateValues,
  type JobOrderPayrollMetadataValues,
} from "@/lib/validations/job-order-payroll-schema";
import {
  JOB_ORDER_PAYROLL_MAX_PAGE_SIZE,
  JOB_ORDER_PAYROLL_PAGE_SIZE,
  PAYROLL_SELECT,
  toNumber,
} from "@/lib/job-order-payroll-queries";
import { buildIlikeOrFilter } from "@/lib/postgrest-filters";
import type {
  JobOrderAreaOption,
  JobOrderPayroll,
  JobOrderPayrollMember,
} from "@/lib/types";

// `loadMembers`, `recomputeAreas` and `loadJobOrdersForSnapshot` used to live
// here. They are plain database access with no auth, no revalidation and no
// audit, and exporting them from a `"use server"` module gave each one a
// server-action endpoint with no auth check — not exploitable, since their
// first parameter is a live SupabaseClient and therefore not serializable, but
// a wider action namespace for no benefit. They now live in
// `@/lib/job-order-payroll-repo`, which also makes them importable by
// supabase/tests/job-order-payroll.test.mts (see that module's header).

/**
 * Deletes a just-created payroll row after its member insert failed, so a
 * zero-member payroll isn't left stranded. Logged, not thrown: the caller
 * already has the original insert error to surface and must still return it.
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

// `assertWritable` (the shared write guard used below and by
// job-order-payroll-member-actions.ts) lives in the plain,
// non-`"use server"` `@/lib/job-order-payroll-guards` module so its decision
// logic can be unit-tested without a Supabase client — see
// supabase/tests/job-order-payroll-guards.test.mts. Imported at the top of
// this file.

// ── Reads ────────────────────────────────────────────────────────────

export interface JobOrderPayrollFilters {
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
  if (!canManageJobOrders(user?.roles)) return { rows: [], totalCount: 0 };

  const supabase = createAdminClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    JOB_ORDER_PAYROLL_MAX_PAGE_SIZE,
    Math.max(1, filters.pageSize ?? JOB_ORDER_PAYROLL_PAGE_SIZE),
  );
  const from = (page - 1) * pageSize;

  let query = supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select(PAYROLL_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order("period_start", { ascending: false })
    .order("period_end", { ascending: false });

  if (filters.periodFrom) query = query.gte("period_end", filters.periodFrom);
  if (filters.periodTo) query = query.lte("period_start", filters.periodTo);
  if (filters.search?.trim()) {
    // `areas` is itself a comma-joined label, so a comma in the search term is
    // especially likely here — buildIlikeOrFilter is what keeps that from
    // becoming a PostgREST 400.
    query = query.or(
      buildIlikeOrFilter(
        ["description", "particulars", "areas"],
        filters.search.trim(),
      ),
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
      .select("payroll_id, daily_rate, days, hours, sss_ss, sss_ec")
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
    {
      rate: number | null;
      days: number | null;
      hours: number | null;
      sss_ss: number | null;
      sss_ec: number | null;
    }[]
  >();
  for (const m of members) {
    const row = m as Record<string, unknown>;
    const key = row.payroll_id as string;
    const list = byPayroll.get(key) ?? [];
    list.push({
      rate: toNumber(row.daily_rate),
      days: toNumber(row.days),
      hours: toNumber(row.hours),
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
  if (!canManageJobOrders(user?.roles)) return { payroll: null, members: [] };

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
      hours: m.hours,
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
  if (!canManageJobOrders(user?.roles)) return [];

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

export async function createJobOrderPayroll(
  input: JobOrderPayrollCreateValues,
): Promise<{ data?: { id: string }; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrderPayroll({ roles: user?.roles, canManageModulePayroll: user?.canManageModulePayroll })) {
    return { error: "Unauthorized" };
  }

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
  if (!canManageJobOrderPayroll({ roles: user?.roles, canManageModulePayroll: user?.canManageModulePayroll })) {
    return { error: "Unauthorized" };
  }

  const parsed = jobOrderPayrollMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payroll data" };
  }

  const supabase = createAdminClient();
  const blocked = await assertWritable(supabase, id);
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
 * reproducible; a rate that has since changed is edited on the new draft.
 */
export async function duplicateJobOrderPayroll(
  sourceId: string,
  metadata: JobOrderPayrollMetadataValues,
): Promise<{ data?: { id: string }; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrderPayroll({ roles: user?.roles, canManageModulePayroll: user?.canManageModulePayroll })) {
    return { error: "Unauthorized" };
  }

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

/** super_admin only, soft delete. */
export async function deleteJobOrderPayroll(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canDeletePayroll(user?.roles)) return { error: "Unauthorized" };

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

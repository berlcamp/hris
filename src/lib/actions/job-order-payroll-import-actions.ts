"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  planJobOrderPayrollImport,
  type JobOrderPayrollMemberUpsertRow,
  type JobOrderPayrollRoster,
  type JobOrderPayrollRosterEntry,
} from "@/lib/job-order-payroll-import";

const ROSTER_PAGE_SIZE = 1000; // supabase/config.toml caps PostgREST max_rows at 1000.
const UPSERT_CHUNK = 500;

export interface JobOrderPayrollImportResult {
  payrollsCreated: number;
  payrollsUpdated: number;
  payrollsSkippedEmpty: number;
  payrollsIsolated: { legacy_id: string; reason: string }[];
  membersCreated: number;
  membersUpdated: number;
  unresolvedMembers: { legacy_id: string; reason: string }[];
  warnings: string[];
}

function emptyResult(warnings: string[] = []): JobOrderPayrollImportResult {
  return {
    payrollsCreated: 0,
    payrollsUpdated: 0,
    payrollsSkippedEmpty: 0,
    payrollsIsolated: [],
    membersCreated: 0,
    membersUpdated: 0,
    unresolvedMembers: [],
    warnings,
  };
}

// This import screen is a one-shot bulk load of legacy payroll history — same
// bar as importJobOrderEmployeesFromCsv in job-order-csv-import-actions.ts.
async function requireSuperAdmin(): Promise<
  { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> } | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "super_admin") return { error: "Insufficient permissions" };
  return { user };
}

function toNumberOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/**
 * Loads every `job_order_employees` row with a legacy_id, WITHOUT filtering
 * `deleted_at` — see `JobOrderPayrollRoster`'s doc comment in
 * job-order-payroll-import.ts for why that omission is the single most
 * important line in this file. Paged with `.range()` because
 * supabase/config.toml caps PostgREST's max_rows at 1000, same reason as
 * `loadJobOrdersForSnapshot` in job-order-payroll-actions.ts.
 */
async function loadRoster(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<JobOrderPayrollRoster> {
  const roster: JobOrderPayrollRoster = new Map();
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_employees")
      .select(
        "id, legacy_id, full_name, sub_area, daily_rate, sss_no, sss_ss, sss_ec, has_atm, landbank_account_number, community_tax_number, community_tax_date, community_tax_place_issued, job_order_areas(name)",
      )
      .not("legacy_id", "is", null)
      .range(from, from + ROSTER_PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to load job_order_employees roster: ${error.message}`);

    const batch = (data ?? []) as Record<string, unknown>[];
    for (const row of batch) {
      if (row.legacy_id == null) continue;
      const area = row.job_order_areas as { name: string } | null;
      const entry: JobOrderPayrollRosterEntry = {
        id: row.id as string,
        full_name: row.full_name as string,
        area_name: area?.name ?? null,
        sub_area: (row.sub_area as string | null) ?? null,
        daily_rate: toNumberOrNull(row.daily_rate),
        sss_no: (row.sss_no as string | null) ?? null,
        sss_ss: toNumberOrNull(row.sss_ss),
        sss_ec: toNumberOrNull(row.sss_ec),
        has_atm: Boolean(row.has_atm),
        landbank_account_number: (row.landbank_account_number as string | null) ?? null,
        community_tax_number: (row.community_tax_number as string | null) ?? null,
        community_tax_date: (row.community_tax_date as string | null) ?? null,
        community_tax_place_issued: (row.community_tax_place_issued as string | null) ?? null,
      };
      roster.set(String(row.legacy_id), entry);
    }

    if (batch.length < ROSTER_PAGE_SIZE) break;
    from += ROSTER_PAGE_SIZE;
  }

  return roster;
}

/** Which of `legacyIds` already exist in `table`, so a summary can tell created from updated. */
async function loadExistingLegacyIds(
  supabase: ReturnType<typeof createAdminClient>,
  table: "job_order_payrolls" | "job_order_payroll_members",
  legacyIds: number[],
): Promise<Set<number>> {
  const found = new Set<number>();
  for (let i = 0; i < legacyIds.length; i += UPSERT_CHUNK) {
    const slice = legacyIds.slice(i, i + UPSERT_CHUNK);
    if (slice.length === 0) continue;
    const { data, error } = await supabase
      .schema("hris")
      .from(table)
      .select("legacy_id")
      .in("legacy_id", slice);
    if (error) throw new Error(`Failed to check existing ${table} legacy_id values: ${error.message}`);
    for (const row of (data ?? []) as { legacy_id: number | null }[]) {
      if (row.legacy_id != null) found.add(row.legacy_id);
    }
  }
  return found;
}

/**
 * Imports the legacy `jopayrolls` + `jopayroll_members` history. This
 * function itself does nothing but auth, load the roster, hand both CSVs to
 * the pure `planJobOrderPayrollImport`, and perform the chunked upserts —
 * every parsing/selection/isolation/snapshot rule lives in
 * `src/lib/job-order-payroll-import.ts` where it can be unit-tested against
 * the real export with zero database dependency (see
 * supabase/tests/job-order-payroll-import.test.mts).
 */
export async function importJobOrderPayrollCsv(
  payrollsCsvText: string,
  membersCsvText: string,
): Promise<JobOrderPayrollImportResult> {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return emptyResult([guard.error]);
  const { user } = guard;

  const supabase = createAdminClient();
  const roster = await loadRoster(supabase);

  const plan = planJobOrderPayrollImport(payrollsCsvText, membersCsvText, roster);
  const warnings = [...plan.summary.warnings];

  // ── Payrolls ─────────────────────────────────────────────────────────
  const existingPayrollLegacyIds = await loadExistingLegacyIds(
    supabase,
    "job_order_payrolls",
    plan.payrollRows.map((r) => r.legacy_id),
  );

  let payrollsCreated = 0;
  let payrollsUpdated = 0;
  const legacyToPayrollId = new Map<number, string>();

  for (let i = 0; i < plan.payrollRows.length; i += UPSERT_CHUNK) {
    const chunk = plan.payrollRows.slice(i, i + UPSERT_CHUNK);
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_payrolls")
      .upsert(chunk, { onConflict: "legacy_id" })
      .select("id, legacy_id");

    if (error) {
      // Isolate the failure, don't abort the whole import — the rest of the
      // chunks may still be good. This should not happen in practice: every
      // row reaching this point already passed the pure layer's isolation
      // checks against chk_job_order_payroll_period.
      warnings.push(
        `Failed to save a batch of ${chunk.length} payroll(s) (legacy_id ${chunk[0]?.legacy_id}..${chunk[chunk.length - 1]?.legacy_id}): ${error.message}`,
      );
      continue;
    }

    for (const row of (data ?? []) as { id: string; legacy_id: number }[]) {
      legacyToPayrollId.set(row.legacy_id, row.id);
      if (existingPayrollLegacyIds.has(row.legacy_id)) payrollsUpdated++;
      else payrollsCreated++;
    }
  }

  // ── Members ──────────────────────────────────────────────────────────
  // Resolve payroll_legacy_id -> the real payroll_id UUID minted above.
  type ResolvedMemberRow = Omit<JobOrderPayrollMemberUpsertRow, "payroll_legacy_id"> & {
    payroll_id: string;
  };
  const resolvedMemberRows: ResolvedMemberRow[] = [];
  const unresolvedMembers = [...plan.summary.unresolvedMembers];

  for (const m of plan.memberRows) {
    const payrollId = legacyToPayrollId.get(m.payroll_legacy_id);
    if (!payrollId) {
      // Only reachable if the parent payroll's upsert chunk failed above —
      // the pure layer never emits a member row for a payroll it isolated
      // or skipped.
      unresolvedMembers.push({
        legacy_id: String(m.legacy_id),
        reason: `parent payroll (legacy_id ${m.payroll_legacy_id}) was not saved`,
      });
      continue;
    }
    const { payroll_legacy_id: _payrollLegacyId, ...rest } = m;
    resolvedMemberRows.push({ ...rest, payroll_id: payrollId });
  }

  const existingMemberLegacyIds = await loadExistingLegacyIds(
    supabase,
    "job_order_payroll_members",
    resolvedMemberRows.map((r) => r.legacy_id),
  );

  let membersCreated = 0;
  let membersUpdated = 0;

  for (let i = 0; i < resolvedMemberRows.length; i += UPSERT_CHUNK) {
    const chunk = resolvedMemberRows.slice(i, i + UPSERT_CHUNK);
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_payroll_members")
      .upsert(chunk, { onConflict: "legacy_id" })
      .select("legacy_id");

    if (error) {
      warnings.push(
        `Failed to save a batch of ${chunk.length} payroll member(s) (legacy_id ${chunk[0]?.legacy_id}..${chunk[chunk.length - 1]?.legacy_id}): ${error.message}`,
      );
      continue;
    }

    for (const row of (data ?? []) as { legacy_id: number }[]) {
      if (existingMemberLegacyIds.has(row.legacy_id)) membersUpdated++;
      else membersCreated++;
    }
  }

  const result: JobOrderPayrollImportResult = {
    payrollsCreated,
    payrollsUpdated,
    payrollsSkippedEmpty: plan.summary.payrollsSkippedEmpty,
    payrollsIsolated: plan.summary.payrollsIsolated,
    membersCreated,
    membersUpdated,
    unresolvedMembers,
    warnings,
  };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "import",
    tableName: "job_order_payrolls",
    newValues: {
      payrollsCreated,
      payrollsUpdated,
      payrollsSkippedEmpty: result.payrollsSkippedEmpty,
      payrollsIsolatedCount: result.payrollsIsolated.length,
      membersCreated,
      membersUpdated,
      unresolvedMembersCount: unresolvedMembers.length,
      warningCount: warnings.length,
    },
  });

  revalidatePath("/job-orders/payroll");

  return result;
}

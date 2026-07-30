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
// The chunked insert-or-skip loop and the existing-legacy_id lookup live in the
// plain `job-order-payroll-repo` module, not here, so the real-stack test can
// import and exercise the actual loop instead of re-running a copy of it.
import {
  loadExistingLegacyIdMap,
  upsertLegacyChunks,
} from "@/lib/job-order-payroll-repo";

const ROSTER_PAGE_SIZE = 1000; // supabase/config.toml caps PostgREST max_rows at 1000.

export interface JobOrderPayrollImportResult {
  payrollsCreated: number;
  /**
   * Rows whose `legacy_id` already exists in `job_order_payrolls` — skipped,
   * not updated. A finalized payroll is an issued government record, so a
   * second run of this importer must never re-price it at whatever the
   * roster says months later; correcting historical data means deleting the
   * affected payroll first and re-importing. See I3 in the final review.
   */
  payrollsSkippedExisting: number;
  payrollsSkippedEmpty: number;
  payrollsIsolated: { legacy_id: string; reason: string }[];
  membersCreated: number;
  /** Same skip-not-update rule as `payrollsSkippedExisting`, for members. */
  membersSkippedExisting: number;
  unresolvedMembers: { legacy_id: string; reason: string }[];
  warnings: string[];
}

function emptyResult(warnings: string[] = []): JobOrderPayrollImportResult {
  return {
    payrollsCreated: 0,
    payrollsSkippedExisting: 0,
    payrollsSkippedEmpty: 0,
    payrollsIsolated: [],
    membersCreated: 0,
    membersSkippedExisting: 0,
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
  // I3 (final review): a finalized payroll is an issued government record —
  // re-running this import must never re-price it at whatever the current
  // roster says. So rows whose legacy_id already exists are SKIPPED, not
  // upserted. `existingPayrollIds` doubles as the seed for
  // `legacyToPayrollId` below, so a member row whose parent payroll already
  // existed (and was therefore skipped this run, not freshly inserted) can
  // still resolve to a real UUID.
  const existingPayrollIds = await loadExistingLegacyIdMap(
    supabase,
    "job_order_payrolls",
    plan.payrollRows.map((r) => r.legacy_id),
  );
  const newPayrollRows = plan.payrollRows.filter(
    (r) => !existingPayrollIds.has(r.legacy_id),
  );
  const payrollsSkippedExisting = plan.payrollRows.length - newPayrollRows.length;

  const legacyToPayrollId = new Map<number, string>(existingPayrollIds);

  // A failed chunk is reported and skipped, not rethrown — the rest of the
  // chunks may still be good. This should not happen in practice: every row
  // reaching this point already passed the pure layer's isolation checks
  // against chk_job_order_payroll_period.
  const payrollUpsert = await upsertLegacyChunks(
    supabase,
    "job_order_payrolls",
    newPayrollRows,
    { noun: "payroll", select: "id, legacy_id" },
  );
  warnings.push(...payrollUpsert.warnings);

  for (const row of payrollUpsert.returned) {
    if (row.id) legacyToPayrollId.set(row.legacy_id, row.id);
  }
  const payrollsCreated = payrollUpsert.returned.length;

  // ── Members ──────────────────────────────────────────────────────────
  // Resolve payroll_legacy_id -> the real payroll_id UUID (freshly minted
  // above, or already existing from a prior run).
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

  // Same skip-not-update rule as payrolls above.
  const existingMemberIds = await loadExistingLegacyIdMap(
    supabase,
    "job_order_payroll_members",
    resolvedMemberRows.map((r) => r.legacy_id),
  );
  const newMemberRows = resolvedMemberRows.filter(
    (r) => !existingMemberIds.has(r.legacy_id),
  );
  const membersSkippedExisting = resolvedMemberRows.length - newMemberRows.length;

  const memberUpsert = await upsertLegacyChunks(
    supabase,
    "job_order_payroll_members",
    newMemberRows,
    { noun: "payroll member", select: "legacy_id" },
  );
  warnings.push(...memberUpsert.warnings);
  const membersCreated = memberUpsert.returned.length;

  const result: JobOrderPayrollImportResult = {
    payrollsCreated,
    payrollsSkippedExisting,
    payrollsSkippedEmpty: plan.summary.payrollsSkippedEmpty,
    payrollsIsolated: plan.summary.payrollsIsolated,
    membersCreated,
    membersSkippedExisting,
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
      payrollsSkippedExisting,
      payrollsSkippedEmpty: result.payrollsSkippedEmpty,
      payrollsIsolatedCount: result.payrollsIsolated.length,
      membersCreated,
      membersSkippedExisting,
      unresolvedMembersCount: unresolvedMembers.length,
      warningCount: warnings.length,
    },
  });

  revalidatePath("/job-orders/payroll");

  return result;
}

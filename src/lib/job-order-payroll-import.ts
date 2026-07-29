/**
 * Pure legacy Job Order payroll CSV importer — no Supabase, no I/O.
 *
 * The legacy Laravel system's `jopayroll_members` table has no rate column —
 * it joined live to `jos.rate` at print time — so migrated amounts are
 * priced at the employee's CURRENT rate rather than what was actually paid.
 * That is why every row this module produces sets `is_reconstructed: true`.
 *
 * This module owns every rule that decides what gets imported: parsing both
 * CSVs, selecting which payrolls to import, isolating the ones that would
 * violate `chk_job_order_payroll_period`, mapping the roster snapshot onto
 * each member, and recording warnings. It takes the two CSV texts plus an
 * already-resolved roster lookup and returns the rows ready to upsert.
 *
 * `src/lib/actions/job-order-payroll-import-actions.ts` is a thin
 * `"use server"` wrapper: auth, load the roster from the DB, call
 * `planJobOrderPayrollImport`, and perform the chunked upserts. Keeping the
 * decision logic here — with no Supabase import anywhere in this file —
 * means it can be unit-tested directly against the real CSVs with zero
 * database dependency. See supabase/tests/job-order-payroll-import.test.mts.
 */

// Relative imports WITH the .ts extension, not the `@/lib/...` alias used
// everywhere else in this codebase: this module is loaded directly by
// `node --experimental-strip-types` from
// supabase/tests/job-order-payroll-import.test.mts (no webpack/Next in the
// loop to resolve the alias), and Node's ESM resolver requires an explicit
// extension on relative specifiers. `allowImportingTsExtensions` in
// tsconfig.json makes this equally valid for the Next/tsc build.
import { parseCsvTextToRows } from "./parse-csv.ts";
import {
  normHeader,
  colIndex,
  parseMoney,
  parseFlexibleCsvDate,
} from "./csv-import-helpers.ts";

// ---------------------------------------------------------------------------
// Roster (input)
// ---------------------------------------------------------------------------

/**
 * What the caller must resolve legacy `jo_id` values to before calling
 * `planJobOrderPayrollImport`. Every field a payroll member row freezes,
 * plus the `job_order_employees.id` the member links to.
 */
export interface JobOrderPayrollRosterEntry {
  id: string;
  full_name: string;
  area_name: string | null;
  sub_area: string | null;
  daily_rate: number | null;
  sss_no: string | null;
  sss_ss: number | null;
  sss_ec: number | null;
  has_atm: boolean;
  landbank_account_number: string | null;
  community_tax_number: string | null;
  community_tax_date: string | null;
  community_tax_place_issued: string | null;
}

/**
 * legacy `jos.id` (as a string) -> roster snapshot.
 *
 * MUST be built WITHOUT filtering `deleted_at`. 5,893 of 11,015 legacy
 * `jopayroll_members` rows (54%) reference employees who are soft-deleted in
 * `job_order_employees` today — Spec 1's importer carried `deleted_at`
 * across, so those people are still rows in the table, just inactive.
 * Filtering this map by `deleted_at IS NULL` would silently drop half the
 * payroll history while this module still reports a clean summary.
 */
export type JobOrderPayrollRoster = Map<string, JobOrderPayrollRosterEntry>;

// ---------------------------------------------------------------------------
// Output rows (ready for `.upsert(rows, { onConflict: "legacy_id" })`)
// ---------------------------------------------------------------------------

export interface JobOrderPayrollUpsertRow {
  legacy_id: number;
  period_start: string;
  period_end: string;
  days: number | null;
  description: string | null;
  particulars: string | null;
  areas: string | null;
  payroll_date: null;
  status: "finalized";
  is_reconstructed: true;
  created_at: string | null;
  deleted_at: string | null;
}

/**
 * `payroll_legacy_id` stands in for the real `payroll_id` UUID, which does
 * not exist until the payroll rows above are upserted. The server action
 * resolves it to a UUID after that upsert completes, using the same
 * `legacy_id` to look it up.
 */
export interface JobOrderPayrollMemberUpsertRow {
  legacy_id: number;
  payroll_legacy_id: number;
  job_order_employee_id: string;
  days: number | null;
  hours: number | null;
  full_name: string;
  area_name: string | null;
  sub_area: string | null;
  daily_rate: number | null;
  sss_no: string | null;
  sss_ss: number | null;
  sss_ec: number | null;
  has_atm: boolean;
  landbank_account_number: string | null;
  community_tax_number: string | null;
  community_tax_date: string | null;
  community_tax_place_issued: string | null;
}

export interface JobOrderPayrollImportSummary {
  payrollsSkippedEmpty: number;
  payrollsIsolated: { legacy_id: string; reason: string }[];
  unresolvedMembers: { legacy_id: string; reason: string }[];
  warnings: string[];
}

export interface JobOrderPayrollImportPlan {
  summary: JobOrderPayrollImportSummary;
  payrollRows: JobOrderPayrollUpsertRow[];
  memberRows: JobOrderPayrollMemberUpsertRow[];
}

const OUT_OF_RANGE_MIN_YEAR = 2020;
const OUT_OF_RANGE_MAX_YEAR = 2027;

function nullable(s: string | undefined): string | null {
  const v = (s ?? "").trim();
  return v.length === 0 ? null : v;
}

function buildHeaderMap(rows: string[][]): Map<string, number> {
  const map = new Map<string, number>();
  if (rows.length === 0) return map;
  rows[0].map(normHeader).forEach((h, i) => map.set(h, i));
  return map;
}

function emptySummary(): JobOrderPayrollImportSummary {
  return {
    payrollsSkippedEmpty: 0,
    payrollsIsolated: [],
    unresolvedMembers: [],
    warnings: [],
  };
}

function emptyPlan(warnings: string[]): JobOrderPayrollImportPlan {
  return {
    summary: { ...emptySummary(), warnings },
    payrollRows: [],
    memberRows: [],
  };
}

/**
 * Parses both legacy CSVs, selects which payrolls to import, isolates the
 * ones that cannot land without violating the DB, and maps every resolvable
 * member onto its frozen roster snapshot. See the module doc for the full
 * rule set; the short version:
 *
 *   1. Import a payroll if it has >=1 member OR a non-blank `deleted_at`.
 *      Everything else is `payrollsSkippedEmpty`.
 *   2. A selected payroll is isolated (reported, not inserted) when either
 *      `from`/`to` fails to parse, or `period_end < period_start` — the
 *      latter would otherwise violate `chk_job_order_payroll_period`.
 *   3. A parsed `period_start` outside [2020, 2027] adds a warning naming
 *      the legacy_id, independent of whether the row ends up isolated.
 *   4. Every member of an imported payroll takes its full snapshot from the
 *      roster at plan time. A `jo_id` that does not resolve is reported in
 *      `unresolvedMembers` and never queued for insert — `full_name` is
 *      `NOT NULL` on the member table, so a nameless row cannot print.
 *   5. `weekends` and `holidays` columns are read from the header (so a
 *      missing header is still reported) but never mapped to output rows —
 *      the member table has no columns for them.
 */
export function planJobOrderPayrollImport(
  payrollsCsvText: string,
  membersCsvText: string,
  roster: JobOrderPayrollRoster,
): JobOrderPayrollImportPlan {
  const warnings: string[] = [];
  const payrollsIsolated: { legacy_id: string; reason: string }[] = [];
  const unresolvedMembers: { legacy_id: string; reason: string }[] = [];
  const payrollRows: JobOrderPayrollUpsertRow[] = [];
  const memberRows: JobOrderPayrollMemberUpsertRow[] = [];
  let payrollsSkippedEmpty = 0;

  // ── Parse payrolls.csv ─────────────────────────────────────────────
  const prows = parseCsvTextToRows(payrollsCsvText);
  if (prows.length < 2) {
    return emptyPlan([
      "jopayrolls.csv has no data rows — nothing was imported.",
    ]);
  }
  const pmap = buildHeaderMap(prows);
  const pIdCol = colIndex(pmap, "id");
  const fromCol = colIndex(pmap, "from");
  const toCol = colIndex(pmap, "to");
  if (pIdCol === undefined || fromCol === undefined || toCol === undefined) {
    return emptyPlan([
      'jopayrolls.csv is missing a required column ("id", "from", or "to") — nothing was imported.',
    ]);
  }
  const daysCol = colIndex(pmap, "days");
  const areasCol = colIndex(pmap, "areas");
  const descriptionCol = colIndex(pmap, "description");
  const particularsCol = colIndex(pmap, "particulars");
  const deletedAtCol = colIndex(pmap, "deleted_at");
  const createdAtCol = colIndex(pmap, "created_at");

  // An absent optional column would otherwise fail silently for every row —
  // same failure mode job-order-csv-import-actions.ts guards against. Never
  // report a clean-looking summary while quietly blanking a whole column.
  const PAYROLL_OPTIONAL_COLUMNS: {
    header: string;
    index: number | undefined;
    consequence: string;
  }[] = [
    { header: "days", index: daysCol, consequence: "days will be blank for every imported payroll" },
    { header: "areas", index: areasCol, consequence: "areas will be blank for every imported payroll" },
    { header: "description", index: descriptionCol, consequence: "description will be blank for every imported payroll" },
    { header: "particulars", index: particularsCol, consequence: "particulars will be blank for every imported payroll" },
    {
      header: "deleted_at",
      index: deletedAtCol,
      consequence:
        "legacy soft-deletes will not carry over, and payrolls with no members that exist only as a legacy delete stamp will be skipped as empty instead of imported",
    },
    { header: "created_at", index: createdAtCol, consequence: "created_at will default to the import time instead of the legacy timestamp" },
  ];
  for (const { header, index, consequence } of PAYROLL_OPTIONAL_COLUMNS) {
    if (index === undefined) {
      warnings.push(`jopayrolls.csv: column "${header}" not found — ${consequence}.`);
    }
  }

  // ── Parse members.csv and group by jopayroll_id BEFORE deciding what to
  //    import — the selection rule below needs to know which payrolls have
  //    at least one member. ─────────────────────────────────────────────
  const mrows = parseCsvTextToRows(membersCsvText);
  const mmap = buildHeaderMap(mrows);
  const mIdCol = colIndex(mmap, "id");
  const mPayrollIdCol = colIndex(mmap, "jopayroll_id");
  const mJoIdCol = colIndex(mmap, "jo_id");
  const mDaysCol = colIndex(mmap, "days");
  const mHoursCol = colIndex(mmap, "hours");
  // Read (so a missing header is still reported) and then discarded: the
  // member table has no columns for these — see migration 064.
  const mWeekendsCol = colIndex(mmap, "weekends");
  const mHolidaysCol = colIndex(mmap, "holidays");

  if (mIdCol === undefined || mPayrollIdCol === undefined || mJoIdCol === undefined) {
    warnings.push(
      'jopayroll_members.csv is missing a required column ("id", "jopayroll_id", or "jo_id") — no members were imported.',
    );
  }

  const MEMBER_OPTIONAL_COLUMNS: {
    header: string;
    index: number | undefined;
    consequence: string;
  }[] = [
    { header: "days", index: mDaysCol, consequence: "days will be blank for every imported member" },
    { header: "hours", index: mHoursCol, consequence: "hours (overtime) will be blank for every imported member" },
    { header: "weekends", index: mWeekendsCol, consequence: "weekends values (already discarded on import) could not even be read" },
    { header: "holidays", index: mHolidaysCol, consequence: "holidays values (already discarded on import) could not even be read" },
  ];
  for (const { header, index, consequence } of MEMBER_OPTIONAL_COLUMNS) {
    if (index === undefined) {
      warnings.push(`jopayroll_members.csv: column "${header}" not found — ${consequence}.`);
    }
  }

  interface MemberRecord {
    rowNum: number;
    raw: string[];
  }
  const membersByPayroll = new Map<string, MemberRecord[]>();
  if (mIdCol !== undefined && mPayrollIdCol !== undefined && mJoIdCol !== undefined) {
    for (let r = 1; r < mrows.length; r++) {
      const row = mrows[r];
      const payrollLegacyId = (row[mPayrollIdCol] ?? "").trim();
      if (!payrollLegacyId) continue;
      const list = membersByPayroll.get(payrollLegacyId) ?? [];
      list.push({ rowNum: r + 1, raw: row });
      membersByPayroll.set(payrollLegacyId, list);
    }
  }

  // ── Select, isolate, and queue payrolls ─────────────────────────────
  const importedPayrollIds = new Set<string>();
  const isolatedPayrollIds = new Set<string>();
  const seenPayrollLegacyIds = new Map<string, number>(); // legacy_id -> first row number

  for (let r = 1; r < prows.length; r++) {
    const row = prows[r];
    const rowNum = r + 1;
    const id = (row[pIdCol] ?? "").trim();
    const deletedAtRaw = deletedAtCol !== undefined ? row[deletedAtCol] : undefined;
    const hasDeletedAt = nullable(deletedAtRaw) !== null;
    const members = membersByPayroll.get(id) ?? [];
    const hasMembers = members.length > 0;

    if (!hasMembers && !hasDeletedAt) {
      payrollsSkippedEmpty++;
      continue;
    }

    const legacyIdNum = Number(id);
    if (!id || !Number.isFinite(legacyIdNum)) {
      payrollsIsolated.push({
        legacy_id: id || `row ${rowNum}`,
        reason: `missing or invalid id "${row[pIdCol] ?? ""}"`,
      });
      isolatedPayrollIds.add(id);
      continue;
    }
    if (seenPayrollLegacyIds.has(id)) {
      payrollsIsolated.push({
        legacy_id: id,
        reason: `duplicate id (also used by row ${seenPayrollLegacyIds.get(id)})`,
      });
      isolatedPayrollIds.add(id);
      continue;
    }
    seenPayrollLegacyIds.set(id, rowNum);

    const fromRaw = row[fromCol] ?? "";
    const toRaw = row[toCol] ?? "";
    const periodStart = parseFlexibleCsvDate(fromRaw);
    const periodEnd = parseFlexibleCsvDate(toRaw);

    if (periodStart === null || periodEnd === null) {
      payrollsIsolated.push({
        legacy_id: id,
        reason: `unparseable period date (from="${fromRaw}", to="${toRaw}")`,
      });
      isolatedPayrollIds.add(id);
      continue;
    }

    const startYear = Number(periodStart.slice(0, 4));
    if (startYear < OUT_OF_RANGE_MIN_YEAR || startYear > OUT_OF_RANGE_MAX_YEAR) {
      warnings.push(
        `legacy payroll ${id}: period_start ${periodStart} is outside the expected ${OUT_OF_RANGE_MIN_YEAR}-${OUT_OF_RANGE_MAX_YEAR} range — verify the source "from" value ("${fromRaw}").`,
      );
    }

    // Checked AFTER the out-of-range warning above: the warning must fire
    // regardless of whether the row also gets isolated (legacy payroll 11 —
    // 12/06/1979 -> 07/17/1979 — hits both).
    if (periodEnd < periodStart) {
      payrollsIsolated.push({
        legacy_id: id,
        reason: `period_end (${periodEnd}) is before period_start (${periodStart}) — would violate chk_job_order_payroll_period`,
      });
      isolatedPayrollIds.add(id);
      continue;
    }

    importedPayrollIds.add(id);
    payrollRows.push({
      legacy_id: legacyIdNum,
      period_start: periodStart,
      period_end: periodEnd,
      days: daysCol !== undefined ? parseMoney(row[daysCol] ?? "") : null,
      description: nullable(descriptionCol !== undefined ? row[descriptionCol] : undefined),
      particulars: nullable(particularsCol !== undefined ? row[particularsCol] : undefined),
      areas: nullable(areasCol !== undefined ? row[areasCol] : undefined),
      payroll_date: null,
      status: "finalized",
      is_reconstructed: true,
      // Raw legacy timestamps ("MM/DD/YYYY HH:MM:SS") pass through verbatim
      // and let Postgres cast them — same convention as deleted_at on
      // job_order_employees in job-order-csv-import-actions.ts. These are
      // full timestamps, not bare dates, so parseFlexibleCsvDate (which
      // returns YYYY-MM-DD only) would silently drop the time component.
      created_at: nullable(createdAtCol !== undefined ? row[createdAtCol] : undefined),
      deleted_at: nullable(deletedAtRaw),
    });
  }

  // ── Map members of imported payrolls onto their roster snapshot ─────
  const seenMemberLegacyIds = new Map<string, number>();
  for (const [payrollId, records] of membersByPayroll) {
    if (isolatedPayrollIds.has(payrollId)) {
      warnings.push(
        `${records.length} member row(s) referencing legacy payroll ${payrollId} were not imported — that payroll was isolated.`,
      );
      continue;
    }
    if (!importedPayrollIds.has(payrollId)) {
      // Only reachable for a dangling FK — a member row whose jopayroll_id
      // does not match any row in jopayrolls.csv at all. Every jopayroll_id
      // that DOES appear in jopayrolls.csv is guaranteed `hasMembers === true`
      // for that row (this very map entry proves it), so it is always
      // selected and ends up in either `importedPayrollIds` or
      // `isolatedPayrollIds` above — never skipped-empty. Today's export has
      // no dangling references, but this must fail loud rather than
      // silently drop rows if a future re-export does.
      warnings.push(
        `${records.length} member row(s) referencing legacy payroll ${payrollId} were not imported — no payroll with that id exists in jopayrolls.csv.`,
      );
      continue;
    }

    const payrollLegacyIdNum = Number(payrollId);
    for (const { rowNum, raw: row } of records) {
      const memberIdRaw = mIdCol !== undefined ? (row[mIdCol] ?? "").trim() : "";
      const memberLegacyIdNum = Number(memberIdRaw);
      const memberLegacyId = memberIdRaw || `row ${rowNum}`;

      if (!memberIdRaw || !Number.isFinite(memberLegacyIdNum)) {
        unresolvedMembers.push({
          legacy_id: memberLegacyId,
          reason: `missing or invalid id "${memberIdRaw}"`,
        });
        continue;
      }
      if (seenMemberLegacyIds.has(memberIdRaw)) {
        unresolvedMembers.push({
          legacy_id: memberLegacyId,
          reason: `duplicate id (also used by row ${seenMemberLegacyIds.get(memberIdRaw)})`,
        });
        continue;
      }
      seenMemberLegacyIds.set(memberIdRaw, rowNum);

      const joId = mJoIdCol !== undefined ? (row[mJoIdCol] ?? "").trim() : "";
      const rosterEntry = roster.get(joId);
      if (!rosterEntry) {
        unresolvedMembers.push({
          legacy_id: memberLegacyId,
          reason: `jo_id "${joId}" was not found in the job_order_employees roster`,
        });
        continue;
      }

      memberRows.push({
        legacy_id: memberLegacyIdNum,
        payroll_legacy_id: payrollLegacyIdNum,
        job_order_employee_id: rosterEntry.id,
        days: mDaysCol !== undefined ? parseMoney(row[mDaysCol] ?? "") : null,
        hours: mHoursCol !== undefined ? parseMoney(row[mHoursCol] ?? "") : null,
        full_name: rosterEntry.full_name,
        area_name: rosterEntry.area_name,
        sub_area: rosterEntry.sub_area,
        daily_rate: rosterEntry.daily_rate,
        sss_no: rosterEntry.sss_no,
        sss_ss: rosterEntry.sss_ss,
        sss_ec: rosterEntry.sss_ec,
        has_atm: rosterEntry.has_atm,
        landbank_account_number: rosterEntry.landbank_account_number,
        community_tax_number: rosterEntry.community_tax_number,
        community_tax_date: rosterEntry.community_tax_date,
        community_tax_place_issued: rosterEntry.community_tax_place_issued,
      });
    }
  }

  return {
    summary: {
      payrollsSkippedEmpty,
      payrollsIsolated,
      unresolvedMembers,
      warnings,
    },
    payrollRows,
    memberRows,
  };
}

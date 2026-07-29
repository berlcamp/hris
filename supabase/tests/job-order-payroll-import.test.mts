// Unit test for `planJobOrderPayrollImport` in
// `src/lib/job-order-payroll-import.ts`, run against the REAL legacy export
// files under `supabase/old_jo_data/` (gitignored, local only — this test is
// a no-op, not a failure, when they are absent, so CI without the files
// still passes).
//
// This is the verification the task brief's "upload on the import screen"
// step cannot be: the import screen requires Google OAuth (no local session
// in this environment) and the local DB holds 0 job_order_employees / 0
// job_order_payrolls, so there is no roster to resolve against there either.
// Reading the three CSVs directly and building the roster lookup from
// jos.csv makes the hard numbers below genuinely verified rather than
// merely asserted.
//
// The five numbers matter because this importer's failure mode is a green
// summary over silently wrong data — see job-order-payroll-import.ts's
// module doc for the roster-deleted_at trap this guards against.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvTextToRows } from "../../src/lib/parse-csv.ts";
import { normHeader, colIndex, parseMoney } from "../../src/lib/csv-import-helpers.ts";
import {
  planJobOrderPayrollImport,
  type JobOrderPayrollRoster,
  type JobOrderPayrollRosterEntry,
} from "../../src/lib/job-order-payroll-import.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "old_jo_data");
const PAYROLLS_CSV = path.join(DATA_DIR, "jopayrolls.csv");
const MEMBERS_CSV = path.join(DATA_DIR, "jopayroll_members.csv");
const JOS_CSV = path.join(DATA_DIR, "jos.csv");

const haveFiles =
  existsSync(PAYROLLS_CSV) && existsSync(MEMBERS_CSV) && existsSync(JOS_CSV);

function parseJoBoolean(s: string): boolean {
  return s.trim().toLowerCase() === "yes";
}

/**
 * Builds the roster lookup straight from the legacy `jos.csv` export,
 * mirroring what `job-order-payroll-import-actions.ts` would load from
 * `hris.job_order_employees` in production — WITHOUT any `deleted_at`
 * filter. See the module doc on `JobOrderPayrollRoster` for why that
 * omission is deliberate and load-bearing.
 */
function buildRosterFromJosCsv(text: string): JobOrderPayrollRoster {
  const rows = parseCsvTextToRows(text);
  const header = rows[0].map(normHeader);
  const map = new Map<string, number>();
  header.forEach((h, i) => map.set(h, i));

  const idCol = colIndex(map, "id")!;
  const fullNameCol = colIndex(map, "fullname")!;
  const areaCol = colIndex(map, "area_assigned")!;
  const subAreaCol = colIndex(map, "sub_area")!;
  const rateCol = colIndex(map, "rate")!;
  const sssNoCol = colIndex(map, "sss_no")!;
  const sssSsCol = colIndex(map, "sss_ss")!;
  const sssEcCol = colIndex(map, "sss_ec")!;
  const hasAtmCol = colIndex(map, "has_atm")!;
  const accountNumberCol = colIndex(map, "account_number")!;
  const taxNumberCol = colIndex(map, "tax_number")!;
  const taxDateCol = colIndex(map, "tax_date")!;
  const taxIssuedCol = colIndex(map, "tax_issued")!;

  const roster: JobOrderPayrollRoster = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const legacyId = (row[idCol] ?? "").trim();
    if (!legacyId) continue;
    const hasAtm = parseJoBoolean(row[hasAtmCol] ?? "");
    const entry: JobOrderPayrollRosterEntry = {
      // Stand-in for job_order_employees.id (a UUID in production). Only
      // this test's own assertions read it, so the legacy id is sufficient.
      id: `jo-${legacyId}`,
      full_name: (row[fullNameCol] ?? "").trim(),
      area_name: (row[areaCol] ?? "").trim() || null,
      sub_area: (row[subAreaCol] ?? "").trim() || null,
      daily_rate: parseMoney(row[rateCol] ?? ""),
      sss_no: (row[sssNoCol] ?? "").trim() || null,
      sss_ss: parseMoney(row[sssSsCol] ?? ""),
      sss_ec: parseMoney(row[sssEcCol] ?? ""),
      has_atm: hasAtm,
      landbank_account_number: hasAtm ? (row[accountNumberCol] ?? "").trim() || null : null,
      community_tax_number: (row[taxNumberCol] ?? "").trim() || null,
      community_tax_date: (row[taxDateCol] ?? "").trim() || null,
      community_tax_place_issued: (row[taxIssuedCol] ?? "").trim() || null,
    };
    roster.set(legacyId, entry);
  }
  return roster;
}

test(
  "real jos.csv parses to 577 roster entries",
  { skip: !haveFiles && "supabase/old_jo_data/*.csv not present locally" },
  () => {
    const roster = buildRosterFromJosCsv(readFileSync(JOS_CSV, "utf8"));
    assert.equal(roster.size, 577);
  },
);

test(
  "planJobOrderPayrollImport matches the exact numbers derived from the real export",
  { skip: !haveFiles && "supabase/old_jo_data/*.csv not present locally" },
  () => {
    const payrollsCsv = readFileSync(PAYROLLS_CSV, "utf8");
    const membersCsv = readFileSync(MEMBERS_CSV, "utf8");
    const roster = buildRosterFromJosCsv(readFileSync(JOS_CSV, "utf8"));

    const plan = planJobOrderPayrollImport(payrollsCsv, membersCsv, roster);

    // 805 payrolls created (queued for upsert). Local DB holds 0
    // pre-existing job_order_payrolls, so every queued row is a create.
    assert.equal(plan.payrollRows.length, 805, "payrollsCreated");

    // 810 payrolls skipped as empty (no members, no legacy delete stamp).
    assert.equal(plan.summary.payrollsSkippedEmpty, 810, "payrollsSkippedEmpty");

    // Selection (806) + skipped (810) must account for every one of the
    // 1,616 rows in jopayrolls.csv.
    assert.equal(
      plan.payrollRows.length + plan.summary.payrollsIsolated.length + plan.summary.payrollsSkippedEmpty,
      1616,
      "created + isolated + skippedEmpty must equal the 1,616 payroll rows in the export",
    );

    // Exactly 1 payroll isolated: legacy_id 11, 12/06/1979 -> 07/17/1979,
    // period_end before period_start would violate
    // chk_job_order_payroll_period.
    assert.equal(plan.summary.payrollsIsolated.length, 1, "payrollsIsolated count");
    assert.equal(plan.summary.payrollsIsolated[0]?.legacy_id, "11");
    assert.match(plan.summary.payrollsIsolated[0]?.reason ?? "", /period_end.*before.*period_start/i);

    // 11,015 members created, matching every data row in
    // jopayroll_members.csv (payroll 11 has zero members referencing it, so
    // no member is orphaned by the one isolated payroll in today's export).
    assert.equal(plan.memberRows.length, 11015, "membersCreated");

    // 0 unresolved members: every jo_id in jopayroll_members.csv resolves
    // against the roster built from jos.csv WITHOUT a deleted_at filter.
    assert.equal(plan.summary.unresolvedMembers.length, 0, "unresolvedMembers");

    // Exactly one out-of-range warning, naming legacy_id 11 (period_start
    // 1979-12-06 is far outside the expected 2020-2027 range). This must
    // fire independently of the isolation above — both come from the same
    // row.
    const outOfRangeWarnings = plan.summary.warnings.filter((w) => w.includes("outside the expected"));
    assert.equal(outOfRangeWarnings.length, 1, "exactly one out-of-range date warning");
    assert.match(outOfRangeWarnings[0]!, /legacy payroll 11\b/);

    // No missing-column warnings: every expected header is present in
    // today's export.
    const missingColumnWarnings = plan.summary.warnings.filter((w) => w.includes("column") && w.includes("not found"));
    assert.equal(missingColumnWarnings.length, 0, "no missing-column warnings for today's export");

    // weekends/holidays are read and discarded, never mapped onto a member
    // row — the member table has no columns for them (migration 064).
    for (const row of plan.memberRows) {
      assert.ok(!("weekends" in row));
      assert.ok(!("holidays" in row));
    }
  },
);

// The exact-numbers test above proves quantities — how many payrolls and
// members came out the other end. It cannot prove the SNAPSHOT MAPPING is
// correct: `planJobOrderPayrollImport` assigns 13 scalar fields from the
// roster entry onto each member row by name, not by spreading the roster
// entry wholesale. A transposition in that assignment block — e.g. swapping
// `sss_ss` and `sss_ec`, or `area_name` and `sub_area`, or `community_tax_number`
// and `sss_no` — produces byte-identical counts (same number of rows, same
// isolated/unresolved lists) and would pass every assertion above while
// quietly writing wrong SSS deductions and wrong area/ID fields onto a real,
// migrated government payroll record. This test picks one real employee from
// jos.csv and checks every snapshot field against the source roster row, so
// a transposition like that fails loudly instead of hiding behind a green
// summary.
test(
  "member snapshot fields exactly match the roster row — not merely present, but correctly mapped one-to-one",
  { skip: !haveFiles && "supabase/old_jo_data/*.csv not present locally" },
  () => {
    const payrollsCsv = readFileSync(PAYROLLS_CSV, "utf8");
    const membersCsv = readFileSync(MEMBERS_CSV, "utf8");
    const roster = buildRosterFromJosCsv(readFileSync(JOS_CSV, "utf8"));

    const plan = planJobOrderPayrollImport(payrollsCsv, membersCsv, roster);

    // jos.csv legacy id 5 — "Gabato, Leomar N", Solid Waste and Environment
    // Management Office / Driver. Chosen deliberately because every
    // same-typed-neighbour pair a by-name assignment could transpose has
    // DIFFERENT values here, so a swap is actually detectable:
    //   - sss_ss (750) != sss_ec (10)            — catches an SSS-pair swap
    //   - sub_area ("Driver") != area_name        — catches an area/sub_area swap
    //   - sss_no, community_tax_number, landbank_account_number are three
    //     distinct non-null strings — catches an identifier-field swap
    // (If sss_ss and sss_ec happened to be equal for this employee, swapping
    // them would produce an identical object and prove nothing — that's
    // exactly why this one was picked over the first candidate found.)
    const rosterEntry = roster.get("5");
    assert.ok(rosterEntry, "fixture assumption: jos.csv legacy id 5 must exist");
    assert.equal(rosterEntry.full_name, "Gabato, Leomar N");
    assert.equal(rosterEntry.sss_ss, 750);
    assert.equal(rosterEntry.sss_ec, 10);
    assert.notEqual(rosterEntry.sss_ss, rosterEntry.sss_ec);
    assert.equal(rosterEntry.sub_area, "Driver");
    assert.notEqual(rosterEntry.sub_area, rosterEntry.area_name);

    // Member legacy_id 267: jopayroll_id 4, jo_id 5, days 11, hours blank —
    // one of 60 member rows in jopayroll_members.csv referencing this
    // employee.
    const member = plan.memberRows.find(
      (m) => m.legacy_id === 267 && m.job_order_employee_id === rosterEntry.id,
    );
    assert.ok(member, "expected member row legacy_id 267 (jo_id 5) to be present in the plan");

    assert.deepEqual(
      {
        full_name: member.full_name,
        area_name: member.area_name,
        sub_area: member.sub_area,
        daily_rate: member.daily_rate,
        sss_no: member.sss_no,
        sss_ss: member.sss_ss,
        sss_ec: member.sss_ec,
        has_atm: member.has_atm,
        landbank_account_number: member.landbank_account_number,
        community_tax_number: member.community_tax_number,
        community_tax_date: member.community_tax_date,
        community_tax_place_issued: member.community_tax_place_issued,
      },
      {
        full_name: "Gabato, Leomar N",
        area_name: "Solid Waste and Environment Management Office",
        sub_area: "Driver",
        daily_rate: 500,
        sss_no: "06-2237741-2",
        sss_ss: 750,
        sss_ec: 10,
        has_atm: true,
        landbank_account_number: "0817-0811-85",
        community_tax_number: "12494658",
        community_tax_date: "01/06/2025",
        community_tax_place_issued: "OZAMIZ CITY",
      },
      "every snapshot field must match the roster row for jo_id 5 one-to-one — " +
        "counts alone cannot catch a transposition here",
    );

    // days/hours come from the MEMBER's own CSV row, not the roster (which
    // has no days/hours fields at all) and not the parent payroll's default
    // `days` — the pure function never reads the payroll's `days` column
    // when building a member row.
    assert.equal(member.days, 11);
    assert.equal(member.hours, null);
  },
);

test(
  "re-running the plan against the same inputs is fully idempotent at the pure-function layer",
  { skip: !haveFiles && "supabase/old_jo_data/*.csv not present locally" },
  () => {
    const payrollsCsv = readFileSync(PAYROLLS_CSV, "utf8");
    const membersCsv = readFileSync(MEMBERS_CSV, "utf8");
    const roster = buildRosterFromJosCsv(readFileSync(JOS_CSV, "utf8"));

    const first = planJobOrderPayrollImport(payrollsCsv, membersCsv, roster);
    const second = planJobOrderPayrollImport(payrollsCsv, membersCsv, roster);

    assert.deepEqual(first.payrollRows, second.payrollRows);
    assert.deepEqual(first.memberRows, second.memberRows);
    assert.deepEqual(first.summary, second.summary);
  },
);

// Unit tests for the pure Job Order payroll helpers
// (`src/lib/job-order-payroll-helpers.ts`).
//
// countWeekdays sets the default `days` on every payroll, and the legacy
// system's value is the reconciliation target: legacy payroll
// 07/01/2022–07/15/2022 carries days = 11, which is exactly the Mon–Fri count
// for that range. If this function drifts, the first payroll created in the
// new system stops reconciling against the last one created in the old.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  countWeekdays,
  computeJoGross,
  computeJoNetAmount,
  deriveAreasLabel,
  groupMembersByRate,
  summarizeMembers,
  toPayrollMemberSnapshot,
  toPrintRow,
} from "../../src/lib/job-order-payroll-helpers.ts";
import type { JobOrderEmployee } from "../../src/lib/types.ts";

// ── countWeekdays ───────────────────────────────────────────────────

test("matches the real legacy value for 2022-07-01..2022-07-15", () => {
  // Jul 1 (Fri) + Jul 4-8 + Jul 11-15 = 11
  assert.equal(countWeekdays("2022-07-01", "2022-07-15"), 11);
});

test("counts a single weekday as 1", () => {
  assert.equal(countWeekdays("2026-07-29", "2026-07-29"), 1); // Wednesday
});

test("counts a single weekend day as 0", () => {
  assert.equal(countWeekdays("2026-08-01", "2026-08-01"), 0); // Saturday
});

test("a Saturday-to-Sunday range is 0", () => {
  assert.equal(countWeekdays("2026-08-01", "2026-08-02"), 0);
});

test("spans a month boundary", () => {
  // 2026-07-29 Wed, 30 Thu, 31 Fri, Aug 3 Mon = 4
  assert.equal(countWeekdays("2026-07-29", "2026-08-03"), 4);
});

test("spans a year boundary", () => {
  // 2025-12-31 Wed, 2026-01-01 Thu, 01-02 Fri = 3 (01-03/04 are the weekend)
  assert.equal(countWeekdays("2025-12-31", "2026-01-04"), 3);
});

test("counts a leap day when it is a weekday", () => {
  assert.equal(countWeekdays("2028-02-29", "2028-02-29"), 1); // Tuesday
});

test("end before start yields 0 rather than throwing or going negative", () => {
  assert.equal(countWeekdays("2026-07-15", "2026-07-01"), 0);
});

test("an unparseable date yields 0 rather than NaN", () => {
  assert.equal(countWeekdays("not-a-date", "2026-07-15"), 0);
});

// ── toPayrollMemberSnapshot ─────────────────────────────────────────

function jo(overrides: Partial<JobOrderEmployee> = {}): JobOrderEmployee {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    full_name: "Dela Cruz, Juan P.",
    sort_name: "dela cruz, juan p.",
    sex: "male",
    purok: "Purok 1",
    barangay: "Molicay",
    area_id: "22222222-2222-2222-2222-222222222222",
    area_name: "City Health Office",
    sub_area: "Driver",
    daily_rate: 450,
    previous_daily_rate: 400,
    working_hours: "7:00 PM - 7:00 AM",
    date_started: "2020-02-01",
    eligibility: null,
    recommended_by: null,
    remarks: null,
    remarks_2: null,
    has_atm: true,
    landbank_account_number: "0817-0798-73",
    sss_no: "34-1234567-8",
    sss_ss: 180,
    sss_ec: 10,
    community_tax_number: "CTC-9",
    community_tax_date: "2026-01-05",
    community_tax_place_issued: "Ozamiz City",
    status: "active",
    legacy_id: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("snapshot copies every field the printables need", () => {
  assert.deepEqual(toPayrollMemberSnapshot(jo()), {
    full_name: "Dela Cruz, Juan P.",
    area_name: "City Health Office",
    sub_area: "Driver",
    daily_rate: 450,
    sss_no: "34-1234567-8",
    sss_ss: 180,
    sss_ec: 10,
    has_atm: true,
    landbank_account_number: "0817-0798-73",
    community_tax_number: "CTC-9",
    community_tax_date: "2026-01-05",
    community_tax_place_issued: "Ozamiz City",
  });
});

test("snapshot never carries working_hours, which is a shift descriptor", () => {
  const snap = toPayrollMemberSnapshot(jo()) as Record<string, unknown>;
  assert.equal("working_hours" in snap, false);
});

test("snapshot tolerates a JO with every optional field null", () => {
  const snap = toPayrollMemberSnapshot(
    jo({
      area_name: null,
      sub_area: null,
      daily_rate: null,
      sss_no: null,
      sss_ss: null,
      sss_ec: null,
      has_atm: false,
      landbank_account_number: null,
      community_tax_number: null,
      community_tax_date: null,
      community_tax_place_issued: null,
    }),
  );
  assert.equal(snap.full_name, "Dela Cruz, Juan P.");
  assert.equal(snap.daily_rate, null);
  assert.equal(snap.has_atm, false);
});

// ── toPrintRow ──────────────────────────────────────────────────────

test("print row maps snapshot columns onto the legacy print field names", () => {
  const row = toPrintRow({
    id: "m1",
    payroll_id: "p1",
    job_order_employee_id: null,
    days: 11,
    hours: 4,
    full_name: "Dela Cruz, Juan P.",
    area_name: "City Health Office",
    sub_area: "Driver",
    daily_rate: 450,
    sss_no: "34-1234567-8",
    sss_ss: 180,
    sss_ec: 10,
    has_atm: true,
    landbank_account_number: "0817-0798-73",
    community_tax_number: "CTC-9",
    community_tax_date: "2026-01-05",
    community_tax_place_issued: "Ozamiz City",
    legacy_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

  assert.equal(row.fullname, "Dela Cruz, Juan P.");
  assert.equal(row.area_assigned, "City Health Office");
  assert.equal(row.rate, 450);
  assert.equal(row.account_number, "0817-0798-73");
  assert.equal(row.tax_number, "CTC-9");
  assert.equal(row.tax_date, "2026-01-05");
  assert.equal(row.tax_issued, "Ozamiz City");
});

// ── summarizeMembers / deriveAreasLabel ─────────────────────────────

const member = (
  rate: number | null,
  days: number | null,
  ss: number | null,
  ec: number | null,
  area: string | null = "A",
) => ({
  rate,
  days,
  hours: null,
  sss_ss: ss,
  sss_ec: ec,
  area_name: area,
});

test("summarize adds gross and SSS across members", () => {
  const out = summarizeMembers([
    member(450, 11, 180, 10),
    member(400, 10, 160, 10),
  ]);
  assert.equal(out.gross, 450 * 11 + 400 * 10);
  assert.equal(out.sss, 360);
  assert.equal(out.net, out.gross - 360);
});

test("summarize treats nulls as zero rather than producing NaN", () => {
  const out = summarizeMembers([member(null, null, null, null)]);
  assert.deepEqual(out, { gross: 0, sss: 0, net: 0 });
});

test("summarize of an empty payroll is all zeroes", () => {
  assert.deepEqual(summarizeMembers([]), { gross: 0, sss: 0, net: 0 });
});

test("areas label is unique, sorted and comma-joined", () => {
  assert.equal(
    deriveAreasLabel([
      member(1, 1, 0, 0, "City Health Office"),
      member(1, 1, 0, 0, "CDRRMO"),
      member(1, 1, 0, 0, "City Health Office"),
    ]),
    "CDRRMO, City Health Office",
  );
});

test("areas label ignores null area names", () => {
  assert.equal(deriveAreasLabel([member(1, 1, 0, 0, null)]), null);
});

// ── preserved behaviour of the moved amount helpers ──────────────────

test("gross is rate times days, nulls treated as zero", () => {
  assert.equal(computeJoGross(450, 11), 4950);
  assert.equal(computeJoGross(null, 11), 0);
  assert.equal(computeJoGross(450, null), 0);
});

test("net subtracts the SSS shares from gross", () => {
  assert.equal(
    computeJoNetAmount({ rate: 450, days: 11, sss_ss: 180, sss_ec: 10 }),
    4760,
  );
});

test("groupMembersByRate sorts ascending by rate", () => {
  const groups = groupMembersByRate([
    { rate: 500, days: 1, hours: null, sss_ss: null, sss_ec: null },
    { rate: 400, days: 1, hours: null, sss_ss: null, sss_ec: null },
  ]);
  assert.deepEqual(
    groups.map((g) => g.rate),
    [400, 500],
  );
});

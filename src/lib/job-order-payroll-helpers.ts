/**
 * Job Order payroll calculation helpers.
 *
 *   gross_regular   = rate * days
 *   gross_overtime  = (rate / 8) * hours
 *   gross           = gross_regular + gross_overtime
 *   sss_deduction   = sss_ss + sss_ec
 *   net_amount      = gross - sss_deduction
 *
 * Overtime is part of gross, and therefore of net. It did not used to be:
 * `computeJoNetAmount` ignored `hours` while the printables added `otPay` in
 * themselves, so entering 8 overtime hours moved the printed document but not
 * the members table, the detail header or the list's "Net total" column. The
 * screen and the printout now agree.
 *
 * `null` inputs are treated as 0 so partially-filled rows don't NaN-bomb the
 * totals row in print views.
 */

import type { JobOrderEmployee, JobOrderPayrollMember } from "@/lib/types";

export interface JoPayrollComputeInput {
  rate: number | null | undefined;
  days: number | null | undefined;
  hours?: number | null | undefined;
  sss_ss?: number | null | undefined;
  sss_ec?: number | null | undefined;
}

const n = (v: number | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

export function computeJoGross(
  rate: number | null | undefined,
  days: number | null | undefined,
): number {
  return n(rate) * n(days);
}

export function computeJoOvertimeGross(
  rate: number | null | undefined,
  hours: number | null | undefined,
): number {
  return (n(rate) / 8) * n(hours);
}

export function computeJoSssDeduction(
  sssShare: number | null | undefined,
  ecShare: number | null | undefined,
): number {
  return n(sssShare) + n(ecShare);
}

/**
 * Full net for one member: regular pay plus overtime, less the SSS shares.
 * Callers that omit `hours` get regular-only net, which is what the SUMMARY
 * printable wants (it has no overtime column).
 */
export function computeJoNetAmount(input: JoPayrollComputeInput): number {
  const gross =
    computeJoGross(input.rate, input.days) +
    computeJoOvertimeGross(input.rate, input.hours);
  const sss = computeJoSssDeduction(input.sss_ss, input.sss_ec);
  return gross - sss;
}

export function computeJoOvertimeNet(
  rate: number | null | undefined,
  hours: number | null | undefined,
): number {
  return computeJoOvertimeGross(rate, hours);
}

export interface JoPayrollMemberLike {
  rate: number | null;
  days: number | null;
  hours: number | null;
  sss_ss: number | null;
  sss_ec: number | null;
}

/**
 * The names on one printed page of the Daily Wages Payroll, with that page's
 * money already added up.
 */
export interface JoPayrollPage<M extends JoPayrollMemberLike> {
  members: M[];
  totalGross: number;
  totalSss: number;
  totalNet: number;
}

/**
 * Names per printed page of the Daily Wages Payroll.
 *
 * This number is what makes the Summary of Payrolls truthful: each of its
 * numbered lines is one page of the payroll, so the two documents only agree
 * if the form breaks its pages where this says it does. `renderDailyWagesPayroll`
 * therefore forces a break every N rows rather than leaving it to the browser,
 * which neither document can predict.
 *
 * 15 is the office's number, and it fits both layouts with room to spare.
 * Measured in Chromium at 96dpi with the roster's longest real names (31
 * characters) and its real Community Tax values, on the last page — the only
 * one carrying the signature footer and both totals rows:
 *
 *   page box (legal landscape less the 0.3in margins)   758px
 *   title + agency/period block                          53px
 *   table head (3 bands)                                 52px ATM / 64px not
 *   15 body rows at 18.6px                              279px
 *   SUB TOTAL, and TOTAL when the payroll spans pages   1-2 rows
 *   signature footer, last page only                    139px
 *   ------------------------------------------------------------
 *                                                      ~560-572px
 *
 * The ~190px left over absorbs a dozen cells wrapping to a second line. Both
 * layouts hold the same number only because the no-ATM Community Tax columns
 * were rebalanced to stop PLACE ISSUED wrapping on every row — see the
 * colgroup in generateJobOrderPayroll.ts. Raising this risks a page silently
 * spilling onto a physical sheet the Summary does not know about, which is the
 * whole defect this replaced. To re-measure after a layout change, render the
 * form to HTML and compare `.payroll-page` heights against 758px.
 */
export const DAILY_WAGES_ROWS_PER_PAGE = 15;

function summarizePage<M extends JoPayrollMemberLike>(
  members: M[],
): JoPayrollPage<M> {
  const totalGross = members.reduce(
    (s, m) =>
      s + computeJoGross(m.rate, m.days) + computeJoOvertimeGross(m.rate, m.hours),
    0,
  );
  const totalSss = members.reduce(
    (s, m) => s + computeJoSssDeduction(m.sss_ss, m.sss_ec),
    0,
  );
  return { members, totalGross, totalSss, totalNet: totalGross - totalSss };
}

/**
 * Split the payroll into printed pages.
 *
 * Sorted by name first, because that is the order the Daily Wages form lists
 * people in — a page of the Summary has to cover the same names as the page of
 * the payroll it is numbered after. Both documents call this, so neither can
 * drift from the other.
 *
 * A payroll with no members still returns one (empty) page: a draft with
 * nobody on it yet still prints, and the Summary still needs its one zero
 * line.
 */
export function paginateDailyWages<
  M extends JoPayrollMemberLike & { fullname: string },
>(
  members: M[],
  rowsPerPage: number = DAILY_WAGES_ROWS_PER_PAGE,
): JoPayrollPage<M>[] {
  const size = Math.max(1, Math.trunc(rowsPerPage));
  const sorted = [...members].sort((a, b) =>
    a.fullname.localeCompare(b.fullname),
  );

  const pages: JoPayrollPage<M>[] = [];
  for (let i = 0; i < sorted.length; i += size) {
    pages.push(summarizePage(sorted.slice(i, i + size)));
  }
  return pages.length > 0 ? pages : [summarizePage([])];
}

// ---------------------------------------------------------------------------
// Working days
// ---------------------------------------------------------------------------

/**
 * Parse a `YYYY-MM-DD` string to a Date at local noon, or null if it is not a
 * real calendar date.
 *
 * The noon offset means a DST or timezone shift can never move the date across
 * a day boundary. The round-trip check is the less obvious half: JS does NOT
 * reject a well-formed-but-impossible day — `new Date("2026-02-30T12:00:00")`
 * silently becomes March 2, and `"2026-02-29"` (not a leap year) becomes
 * March 1. Left unchecked that turns a typo into a plausible, wrong working-day
 * count rather than the 0 this module's callers expect for bad input.
 * (`"2026-13-01"` and `"2026-01-32"` do yield Invalid Date, so only the
 * day-of-month overflow needs catching.)
 */
function parseIsoDateAtNoon(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() + 1 !== Number(match[2]) ||
    date.getDate() !== Number(match[3])
  ) {
    return null;
  }
  return date;
}

/**
 * Mon–Fri count in an inclusive date range, both ends `YYYY-MM-DD`.
 *
 * This reproduces the legacy system's `days` exactly: legacy payroll
 * 07/01/2022–07/15/2022 carries days = 11, the plain weekday count, with no
 * holiday deduction. Holidays are surfaced in the UI as an advisory the user
 * subtracts deliberately — see the spec's "Working days" decision.
 *
 * Invalid input yields 0 rather than NaN or a rolled-over count, because this
 * value seeds a form field. See `parseIsoDateAtNoon`.
 */
export function countWeekdays(startIso: string, endIso: string): number {
  const start = parseIsoDateAtNoon(startIso);
  const end = parseIsoDateAtNoon(endIso);
  if (!start || !end) return 0;
  if (end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/**
 * The frozen columns on hris.job_order_payroll_members. Everything the ten
 * printables read, and nothing else — notably NOT working_hours, which is a
 * TEXT shift descriptor ("7:00 PM - 7:00 AM") per migration 061 and has no
 * relationship to the payroll's overtime `hours`.
 */
export interface JobOrderPayrollSnapshot {
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

/** Copy a roster row into the columns a payroll member freezes. */
export function toPayrollMemberSnapshot(
  jo: JobOrderEmployee,
): JobOrderPayrollSnapshot {
  return {
    full_name: jo.full_name,
    area_name: jo.area_name,
    sub_area: jo.sub_area,
    daily_rate: jo.daily_rate,
    sss_no: jo.sss_no,
    sss_ss: jo.sss_ss,
    sss_ec: jo.sss_ec,
    has_atm: jo.has_atm,
    landbank_account_number: jo.landbank_account_number,
    community_tax_number: jo.community_tax_number,
    community_tax_date: jo.community_tax_date,
    community_tax_place_issued: jo.community_tax_place_issued,
  };
}

// ---------------------------------------------------------------------------
// Print row
// ---------------------------------------------------------------------------

/**
 * Flattened row consumed by every payroll PDF. The field names are the legacy
 * Laravel ones and are load-bearing across ten generators, so they are mapped
 * here rather than renamed there.
 *
 * Declared in this module (not the PDF module) so it can be unit-tested
 * without pulling in @react-pdf/renderer.
 */
export interface JobOrderPayrollPrintRow {
  fullname: string;
  area_assigned: string | null;
  rate: number | null;
  days: number | null;
  hours: number | null;
  sss_no: string | null;
  sss_ss: number | null;
  sss_ec: number | null;
  account_number: string | null;
  tax_number: string | null;
  tax_date: string | null;
  tax_issued: string | null;
}

/** Shape a stored member row into the flat struct the PDFs expect. */
export function toPrintRow(
  m: JobOrderPayrollMember,
): JobOrderPayrollPrintRow {
  return {
    fullname: m.full_name,
    area_assigned: m.area_name,
    rate: m.daily_rate,
    days: m.days,
    hours: m.hours,
    sss_no: m.sss_no,
    sss_ss: m.sss_ss,
    sss_ec: m.sss_ec,
    account_number: m.landbank_account_number,
    tax_number: m.community_tax_number,
    tax_date: m.community_tax_date,
    tax_issued: m.community_tax_place_issued,
  };
}

// ---------------------------------------------------------------------------
// Totals and labels
// ---------------------------------------------------------------------------

export interface JobOrderPayrollTotals {
  gross: number;
  sss: number;
  net: number;
}

/**
 * Payroll totals. Null inputs count as zero so a half-filled draft still adds
 * up.
 *
 * `hours` is required, not optional: these totals are what the list and the
 * detail header show, and an optional field would let a call site silently
 * under-report overtime by forgetting to select it — which is exactly how the
 * screen and the printout drifted apart in the first place.
 */
export function summarizeMembers(
  members: {
    rate: number | null;
    days: number | null;
    hours: number | null;
    sss_ss: number | null;
    sss_ec: number | null;
  }[],
): JobOrderPayrollTotals {
  let gross = 0;
  let sss = 0;
  for (const m of members) {
    gross +=
      computeJoGross(m.rate, m.days) + computeJoOvertimeGross(m.rate, m.hours);
    sss += computeJoSssDeduction(m.sss_ss, m.sss_ec);
  }
  return { gross, sss, net: gross - sss };
}

/**
 * The denormalized `areas` label stored on the payroll: unique, sorted,
 * comma-joined member area names. Returns null when no member has an area,
 * so the column stays NULL rather than an empty string.
 */
export function deriveAreasLabel(
  members: { area_name: string | null }[],
): string | null {
  const names = Array.from(
    new Set(
      members
        .map((m) => m.area_name)
        .filter((n): n is string => typeof n === "string" && n.trim() !== ""),
    ),
  ).sort();
  return names.length === 0 ? null : names.join(", ");
}

/**
 * Has the roster drifted from what this member froze?
 *
 * Members are a frozen snapshot taken when the JO is added to the payroll, so
 * a later correction on the roster — a Landbank account number typed in after
 * the payroll was built, say — never reaches the printout on its own. This is
 * the comparison behind the detail page's "Refresh from roster": true means
 * the row is stale and should be rewritten.
 *
 * Every snapshot column is compared, `daily_rate` included: a refresh
 * deliberately overwrites a per-payroll rate correction with the roster's
 * current rate.
 */
export function snapshotDiffersFromMember(
  member: JobOrderPayrollMember,
  snapshot: JobOrderPayrollSnapshot,
): boolean {
  const current = member as unknown as Record<string, unknown>;
  return (Object.keys(snapshot) as (keyof JobOrderPayrollSnapshot)[]).some(
    (key) => (current[key] ?? null) !== (snapshot[key] ?? null),
  );
}

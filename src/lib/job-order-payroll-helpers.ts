/**
 * Job Order payroll calculation helpers.
 *
 *   gross_regular   = rate * days
 *   gross_overtime  = (rate / 8) * hours
 *   sss_deduction   = sss_ss + sss_ec
 *   net_amount      = gross - sss_deduction
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

export function computeJoNetAmount(input: JoPayrollComputeInput): number {
  const gross = computeJoGross(input.rate, input.days);
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

export interface JoPayrollGroup<M extends JoPayrollMemberLike> {
  rate: number;
  members: M[];
  totalGross: number;
  totalSss: number;
  totalNet: number;
}

export function groupMembersByRate<M extends JoPayrollMemberLike>(
  members: M[],
): JoPayrollGroup<M>[] {
  const byRate = new Map<number, M[]>();
  for (const m of members) {
    const r = n(m.rate);
    if (!byRate.has(r)) byRate.set(r, []);
    byRate.get(r)!.push(m);
  }
  return Array.from(byRate.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, ms]) => {
      const totalGross = ms.reduce(
        (s, m) => s + computeJoGross(m.rate, m.days),
        0,
      );
      const totalSss = ms.reduce(
        (s, m) => s + computeJoSssDeduction(m.sss_ss, m.sss_ec),
        0,
      );
      return {
        rate,
        members: ms,
        totalGross,
        totalSss,
        totalNet: totalGross - totalSss,
      };
    });
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

/** Payroll totals. Null inputs count as zero so a half-filled draft still adds up. */
export function summarizeMembers(
  members: {
    rate: number | null;
    days: number | null;
    sss_ss: number | null;
    sss_ec: number | null;
  }[],
): JobOrderPayrollTotals {
  let gross = 0;
  let sss = 0;
  for (const m of members) {
    gross += computeJoGross(m.rate, m.days);
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

// Which duty dates a Department Admin may still file a correction for.
//
// The rule is the payroll month: a department fixes attendance while the months
// it belongs to are still being closed, and HR owns anything older. Three
// payroll months stay open (CORRECTION_OPEN_MONTHS) — the current one and the
// two before it — and payroll is cut early in the following month, so the
// oldest open month hangs on through the first week of the next one.
//
//   Today 2026-07-31  ->  May 1 .. Jul 31
//   Today 2026-08-05  ->  May 1 .. Aug 5     (grace week; May is still open)
//   Today 2026-08-07  ->  May 1 .. Aug 7     (last day of grace)
//   Today 2026-08-08  ->  Jun 1 .. Aug 8     (May is closed)
//
// Two properties that are easy to get wrong and are deliberate:
//
//   * During the grace week the extra month is open ON TOP of the usual three.
//     Dropping the oldest one to make room would leave a department unable to
//     correct the month payroll is closing right now, which is the case the
//     grace week exists for.
//   * The window ends at TODAY, never at month end. Attendance for a day that
//     has not happened is not a correction, and a department filing one would
//     be asserting a fact about the future.
//
// This module is pure and takes `today` as an argument: the caller decides what
// day it is (server actions pass manilaToday(), so the window never depends on
// the filer's browser clock), and the rule stays testable without one.
//
// This restricts DEPARTMENT filings only. The direct-apply roles — HR Admin,
// DTR Manager, OCM Admin — have unrestricted date reach; they are the authority
// that handles late disputes and old records, and the window exists to route
// those to them rather than to fence them out.

/** How many days into the following month the previous month stays open. */
export const CORRECTION_GRACE_DAYS = 7;

/**
 * How many payroll months a department may reach back into, counting the
 * current one. 3 = this month and the two before it.
 */
export const CORRECTION_OPEN_MONTHS = 3;

/**
 * Payroll months HR has reopened to departments on top of the rolling window,
 * as "YYYY-MM". They stay open until removed from this list — the rolling rule
 * never closes them — so delete an entry once its corrections are in.
 *
 * Only the part of a reopened month up to today is open: the future is never
 * correctable, reopened or not.
 */
export const REOPENED_CORRECTION_MONTHS: readonly string[] = [
  "2026-06",
  "2026-07",
  "2026-08",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface CorrectionWindow {
  /** First duty date that may be corrected (YYYY-MM-DD). */
  from: string;
  /** Last duty date that may be corrected — always today (YYYY-MM-DD). */
  to: string;
  /**
   * Reopened ranges that do NOT touch from..to, oldest first. Absent when every
   * reopened month is already inside (or adjoins, and so widened) the window.
   */
  reopened?: { from: string; to: string }[];
}

function lastDayOfMonth(year: number, month: number): string {
  // Day 0 of the next month is the last day of this one; UTC so it cannot shift.
  const d = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/**
 * The open range for a department filing, given today's date.
 *
 * Built from the string's own components rather than a Date, so it cannot
 * shift a day in a runtime whose timezone differs from the one `today` was
 * computed in. Year rollover falls out of the month arithmetic — counting in
 * absolute months makes it fall out for any number of months back, so on
 * 2027-01-09 the window still opens on 2026-11-01.
 */
export function correctionWindow(
  today: string,
  reopenedMonths: readonly string[] = REOPENED_CORRECTION_MONTHS,
): CorrectionWindow {
  const [year, month, day] = today.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const inGrace = day <= CORRECTION_GRACE_DAYS;
  const monthsBack = CORRECTION_OPEN_MONTHS - 1 + (inGrace ? 1 : 0);
  const absolute = year * 12 + (month - 1) - monthsBack;
  const openYear = Math.floor(absolute / 12);
  const openMonth = (absolute % 12) + 1;
  let from = `${openYear}-${String(openMonth).padStart(2, "0")}-01`;

  // Reopened months, clamped to today, newest first so each one that adjoins
  // the window widens it and lets the next-older one adjoin in turn.
  const ranges = reopenedMonths
    .map((ym) => {
      const [y, m] = ym.split("-").map(Number) as [number, number];
      const end = lastDayOfMonth(y, m);
      return { from: `${ym}-01`, to: end < today ? end : today };
    })
    .filter((r) => r.from <= today)
    .sort((a, b) => (a.from < b.from ? 1 : -1));

  const detached: { from: string; to: string }[] = [];
  for (const r of ranges) {
    if (r.to >= shiftDays(from, -1)) {
      if (r.from < from) from = r.from;
    } else {
      detached.push(r);
    }
  }
  // A detached range can still adjoin an older detached one; merge those.
  detached.reverse();
  const merged: { from: string; to: string }[] = [];
  for (const r of detached) {
    const last = merged[merged.length - 1];
    if (last && r.from <= shiftDays(last.to, 1)) {
      if (r.to > last.to) last.to = r.to;
    } else {
      merged.push({ ...r });
    }
  }

  return merged.length
    ? { from, to: today, reopened: merged }
    : { from, to: today };
}

/** True when `date` falls inside the window — ISO dates compare lexicographically. */
export function isDateInCorrectionWindow(
  date: string,
  window: CorrectionWindow,
): boolean {
  if (date >= window.from && date <= window.to) return true;
  return (window.reopened ?? []).some((r) => date >= r.from && date <= r.to);
}

/**
 * Why a date was refused, phrased for the person who picked it. Null when the
 * date is fine.
 */
export function correctionWindowError(
  date: string,
  window: CorrectionWindow,
): string | null {
  if (date > window.to) {
    return `${date} has not happened yet. You can only correct days up to today.`;
  }
  if (date < window.from && !isDateInCorrectionWindow(date, window)) {
    return `${date} is outside the payroll months you can still correct (${describeCorrectionWindow(window)}). Ask HR to correct anything older.`;
  }
  return null;
}

/**
 * The window as a sentence for the filing form, e.g.
 *   "June 1 – August 5, 2026" (grace week)
 *   "July 1 – August 20, 2026"
 */
export function describeCorrectionWindow(window: CorrectionWindow): string {
  const ranges = [...(window.reopened ?? []), { from: window.from, to: window.to }];
  return ranges.map((r) => describeRange(r.from, r.to)).join(" and ");
}

function describeRange(fromIso: string, toIso: string): string {
  const [fy, fm, fd] = fromIso.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toIso.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const fromLabel = `${MONTH_NAMES[fm - 1]} ${fd}`;
  if (fy !== ty) {
    return `${fromLabel}, ${fy} – ${MONTH_NAMES[tm - 1]} ${td}, ${ty}`;
  }
  if (fm !== tm) {
    return `${fromLabel} – ${MONTH_NAMES[tm - 1]} ${td}, ${ty}`;
  }
  return `${fromLabel} – ${td}, ${ty}`;
}

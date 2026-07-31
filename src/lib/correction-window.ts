// Which duty dates a Department Admin may still file a correction for.
//
// The rule is the payroll month: a department fixes attendance while the months
// it belongs to are still being closed, and HR owns anything older. Two payroll
// months stay open (CORRECTION_OPEN_MONTHS) — the current one and the one
// before it — and payroll is cut early in the following month, so the oldest
// open month hangs on through the first week of the next one.
//
//   Today 2026-07-31  ->  Jun 1 .. Jul 31
//   Today 2026-08-05  ->  Jun 1 .. Aug 5     (grace week; June is still open)
//   Today 2026-08-07  ->  Jun 1 .. Aug 7     (last day of grace)
//   Today 2026-08-08  ->  Jul 1 .. Aug 8     (June is closed)
//
// Two properties that are easy to get wrong and are deliberate:
//
//   * During the grace week the extra month is open ON TOP of the usual two.
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
 * current one. 2 = this month and last month.
 */
export const CORRECTION_OPEN_MONTHS = 2;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface CorrectionWindow {
  /** First duty date that may be corrected (YYYY-MM-DD). */
  from: string;
  /** Last duty date that may be corrected — always today (YYYY-MM-DD). */
  to: string;
}

/**
 * The open range for a department filing, given today's date.
 *
 * Built from the string's own components rather than a Date, so it cannot
 * shift a day in a runtime whose timezone differs from the one `today` was
 * computed in. Year rollover falls out of the month arithmetic — counting in
 * absolute months makes it fall out for any number of months back, so on
 * 2027-01-09 the window still opens on 2026-12-01.
 */
export function correctionWindow(today: string): CorrectionWindow {
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
  return {
    from: `${openYear}-${String(openMonth).padStart(2, "0")}-01`,
    to: today,
  };
}

/** True when `date` falls inside the window — ISO dates compare lexicographically. */
export function isDateInCorrectionWindow(
  date: string,
  window: CorrectionWindow,
): boolean {
  return date >= window.from && date <= window.to;
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
  if (date < window.from) {
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
  const [fy, fm] = window.from.split("-").map(Number) as [number, number];
  const [ty, tm, td] = window.to.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const fromLabel = `${MONTH_NAMES[fm - 1]} 1`;
  if (fy !== ty) {
    return `${fromLabel}, ${fy} – ${MONTH_NAMES[tm - 1]} ${td}, ${ty}`;
  }
  if (fm !== tm) {
    return `${fromLabel} – ${MONTH_NAMES[tm - 1]} ${td}, ${ty}`;
  }
  return `${fromLabel} – ${td}, ${ty}`;
}

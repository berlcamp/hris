// Which duty dates a Department Admin may still file a correction for.
//
// The rule is the payroll month: a department fixes attendance while the month
// it belongs to is still being closed, and HR owns anything older. Payroll is
// cut early in the following month, so the month stays open through the first
// week of the next one — file for July while it is July, or up to August 7.
//
//   Today 2026-07-31  ->  Jul 1 .. Jul 31
//   Today 2026-08-05  ->  Jul 1 .. Aug 5     (grace week; August is open too)
//   Today 2026-08-07  ->  Jul 1 .. Aug 7     (last day of grace)
//   Today 2026-08-08  ->  Aug 1 .. Aug 8     (July is closed)
//
// Two properties that are easy to get wrong and are deliberate:
//
//   * During the grace week BOTH months are open. Closing August to reach back
//     into July would leave a department unable to correct the day before
//     yesterday, which is the case the module exists for.
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
 * computed in. Year rollover falls out of the month arithmetic: on 2027-01-03
 * the previous month is December 2026.
 */
export function correctionWindow(today: string): CorrectionWindow {
  const [year, month, day] = today.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const inGrace = day <= CORRECTION_GRACE_DAYS;
  const openYear = inGrace && month === 1 ? year - 1 : year;
  const openMonth = inGrace ? (month === 1 ? 12 : month - 1) : month;
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
    return `${date} is outside the payroll month you can still correct (${describeCorrectionWindow(window)}). Ask HR to correct anything older.`;
  }
  return null;
}

/**
 * The window as a sentence for the filing form, e.g.
 *   "July 1 – August 5, 2026" (grace week)
 *   "August 1 – 8, 2026"
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

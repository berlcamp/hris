// Monday–Sunday week arithmetic over ISO date strings (YYYY-MM-DD).
//
// The weekly DTR module never accepts a free-form date range: a week is the
// unit, so every range it produces is exactly seven days starting on a Monday.
// Keeping that rule in one place lets the server re-derive the range from the
// week start and reject anything that is not a Monday, rather than trusting a
// pair of dates the browser sent.
//
// Everything here goes through the local-midnight form (`YYYY-MM-DDT00:00:00`)
// used across the codebase. That is timezone-safe for weekday maths: the date
// is built from local components, so `getDay()` returns the weekday of the
// calendar date itself no matter what zone the server runs in. Parsing the bare
// `YYYY-MM-DD` form instead would be UTC and could shift the day.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** The Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const d = parseIso(iso);
  const dow = d.getDay(); // 0 = Sunday
  // Sunday belongs to the week that started six days earlier, not the one
  // about to start.
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return toIsoDate(d);
}

/** The Sunday closing the week that starts on `weekStart`. */
export function endOfWeek(weekStart: string): string {
  const d = parseIso(weekStart);
  d.setDate(d.getDate() + 6);
  return toIsoDate(d);
}

/** Move `delta` whole weeks from `weekStart` (negative goes back). */
export function shiftWeeks(weekStart: string, delta: number): string {
  const d = parseIso(weekStart);
  d.setDate(d.getDate() + delta * 7);
  return toIsoDate(d);
}

/** True only for a well-formed ISO date that falls on a Monday. */
export function isWeekStart(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = parseIso(value);
  return !Number.isNaN(d.getTime()) && d.getDay() === 1;
}

/**
 * Human label for a week, collapsing the repeated month/year:
 *   "July 27 – August 2, 2026", "August 3 – 9, 2026", "Dec 28, 2026 – Jan 3, 2027".
 */
export function formatWeekLabel(weekStart: string): string {
  const from = parseIso(weekStart);
  const to = parseIso(endOfWeek(weekStart));
  const fromMonth = MONTH_NAMES[from.getMonth()];
  const toMonth = MONTH_NAMES[to.getMonth()];

  if (from.getFullYear() !== to.getFullYear()) {
    return `${fromMonth} ${from.getDate()}, ${from.getFullYear()} – ${toMonth} ${to.getDate()}, ${to.getFullYear()}`;
  }
  if (from.getMonth() !== to.getMonth()) {
    return `${fromMonth} ${from.getDate()} – ${toMonth} ${to.getDate()}, ${to.getFullYear()}`;
  }
  return `${fromMonth} ${from.getDate()} – ${to.getDate()}, ${to.getFullYear()}`;
}

/** Filename-safe form of the same week, e.g. "2026-07-27_to_2026-08-02". */
export function weekFileLabel(weekStart: string): string {
  return `${weekStart}_to_${endOfWeek(weekStart)}`;
}

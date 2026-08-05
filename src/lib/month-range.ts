// Calendar-month arithmetic over month keys (YYYY-MM).
//
// The DTR module never accepts a free-form date range: a whole calendar month
// is the unit, so every range it produces starts on the 1st and ends on the
// last day of that month. Keeping that rule in one place lets the server
// re-derive the range from the month key and reject anything malformed, rather
// than trusting a pair of dates the browser sent.
//
// Dates are built from local components (`new Date(y, m, d)`), never by parsing
// a bare `YYYY-MM-DD` string, which JS reads as UTC and can shift the day. The
// arithmetic here is on integers anyway, so the only Date use is "how many days
// does this month have".

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Split a validated key into its 1-based year/month numbers. */
function parts(monthKey: string): { year: number; month: number } {
  const match = MONTH_KEY.exec(monthKey);
  if (!match) throw new Error(`Not a month: ${monthKey}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function key(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** True only for a well-formed `YYYY-MM` with a real month number. */
export function isMonthKey(value: string): boolean {
  return MONTH_KEY.test(value);
}

/** The month containing an ISO date: "2026-08-05" -> "2026-08". */
export function toMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** First day of the month, as an ISO date. */
export function startOfMonth(monthKey: string): string {
  return `${monthKey}-01`;
}

/** Last day of the month, as an ISO date — 28/29/30/31 as the calendar says. */
export function endOfMonth(monthKey: string): string {
  const { year, month } = parts(monthKey);
  // Day 0 of the NEXT month is the last day of this one, which is also how the
  // leap-year case resolves itself without a special branch.
  const lastDay = new Date(year, month, 0).getDate();
  return `${monthKey}-${String(lastDay).padStart(2, "0")}`;
}

/** Move `delta` whole months (negative goes back), rolling the year over. */
export function shiftMonths(monthKey: string, delta: number): string {
  const { year, month } = parts(monthKey);
  // Work in months-since-year-0 so a delta of any size lands correctly, and
  // floor rather than truncate so going back past January is right.
  const total = year * 12 + (month - 1) + delta;
  return key(Math.floor(total / 12), (total % 12) + 1);
}

/** Human label for a month: "August 2026". */
export function formatMonthLabel(monthKey: string): string {
  const { year, month } = parts(monthKey);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

// The Date of Filing on a leave application.
//
// HR and OCM Admins may state one when encoding a paper form (migration 097).
// Otherwise the application was filed the day it was entered.

/** What to show as the filing date. Pass the result to formatManilaLongDate. */
export function leaveFiledOn(app: {
  date_filed?: string | null;
  created_at: string;
}): string {
  return app.date_filed ?? app.created_at;
}

/**
 * Why a stated filing date cannot be accepted, or null when it can. A filing
 * date records something that already happened, so it cannot be in the future.
 * `today` is YYYY-MM-DD in Asia/Manila (see manilaToday).
 */
export function dateFiledError(value: string, today: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "Date of filing is not a valid date";

  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  if (!isRealDate) return "Date of filing is not a valid date";

  // YYYY-MM-DD strings compare in calendar order.
  if (value > today) return "Date of filing cannot be in the future";
  return null;
}

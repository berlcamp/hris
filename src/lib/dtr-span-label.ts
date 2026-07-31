// Decides whether a DTR row prints a single label ACROSS the time columns
// instead of the four punch times, and which label that is.
//
// Extracted from dtr-form-column.tsx because the ordering of these branches is
// the whole rule, it is invisible at a glance inside JSX, and it has regressed
// twice: once printing "SATURDAY" over the times of an employee who actually
// worked the weekend, and once printing "HOLIDAY" over a day a correction had
// explicitly cleared as OFF. As a pure function it can be tested directly.

export type DtrSpanKind =
  | "reason"
  | "holiday"
  | "weekend"
  | "leave"
  | "absent";

export interface DtrSpanInput {
  /** Full weekday name, e.g. "Saturday" — as the DTR builders emit it. */
  day_of_week: string;
  holiday: string | null;
  leave_type: string | null;
  is_absent: boolean;
  /** Printable label for an explicitly recorded whole-day reason, or null. */
  no_time_reason_label: string | null;
}

export interface DtrSpan {
  label: string;
  kind: DtrSpanKind;
}

export function isWeekendDayName(dayOfWeek: string): boolean {
  return dayOfWeek === "Saturday" || dayOfWeek === "Sunday";
}

/**
 * Returns the spanning label for a row, or null to print the punch times.
 *
 * Branch order is the rule, most specific first:
 *
 *  1. An explicit `no_time_reason` — a statement somebody recorded about THIS
 *     employee on THIS day (a correction cleared as OFF, a manual entry marked
 *     LEAVE or TRAVEL). Everything below it is a default derived from the
 *     calendar, and a default must never overrule a statement.
 *  2. A full-day holiday nobody worked.
 *  3. A weekend nobody worked.
 *  4. Approved leave.
 *  5. An absence.
 *
 * `hasNoPunch` gates every branch except leave: if the employee actually
 * punched, the times are the point of the row and must be shown.
 */
export function dtrSpanFor(
  entry: DtrSpanInput,
  hasNoPunch: boolean,
): DtrSpan | null {
  if (entry.no_time_reason_label && hasNoPunch) {
    return { label: entry.no_time_reason_label, kind: "reason" };
  }
  if (entry.holiday === "full" && hasNoPunch) {
    return { label: "HOLIDAY", kind: "holiday" };
  }
  if (isWeekendDayName(entry.day_of_week) && hasNoPunch) {
    return { label: entry.day_of_week.toUpperCase(), kind: "weekend" };
  }
  if (entry.leave_type && !entry.is_absent) {
    return { label: "ON LEAVE", kind: "leave" };
  }
  if (entry.is_absent && hasNoPunch) {
    return { label: "ABSENT", kind: "absent" };
  }
  return null;
}

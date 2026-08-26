const MANILA_TZ = "Asia/Manila";

const manilaLongDate = new Intl.DateTimeFormat("en-US", {
  timeZone: MANILA_TZ,
  month: "long",
  day: "numeric",
  year: "numeric",
});

const manilaShortDate = new Intl.DateTimeFormat("en-US", {
  timeZone: MANILA_TZ,
  month: "short",
  day: "numeric",
});

/** "May 18, 2026" in Asia/Manila, regardless of runtime timezone (server or browser). */
export function formatManilaLongDate(input: string | Date): string {
  return manilaLongDate.format(typeof input === "string" ? new Date(input) : input);
}

/** "May 18" in Asia/Manila. */
export function formatManilaShortDate(input: string | Date): string {
  return manilaShortDate.format(typeof input === "string" ? new Date(input) : input);
}

/**
 * Today's date as YYYY-MM-DD in Asia/Manila, regardless of runtime timezone.
 *
 * Lives here rather than in a domain module because "what day is it" is not a
 * CTO question, a corrections question or a payroll question — it is the same
 * answer for all of them, and it must be ONE answer. cto-helpers re-exports it
 * for the CTO code that imported it from there first.
 */
export function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const manilaIsoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The Asia/Manila calendar date (YYYY-MM-DD) of an arbitrary instant.
 *
 * Event scans carry the DEVICE clock, and a phone can be in any timezone or
 * simply wrong. Bucketing the instant in Manila time is what makes a scan taken
 * at 23:58 belong to the day it happened rather than to whatever day it was in
 * UTC when the queue finally synced.
 */
export function manilaDateOf(input: string | Date): string {
  return manilaIsoDate.format(typeof input === "string" ? new Date(input) : input);
}

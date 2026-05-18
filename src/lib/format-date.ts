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

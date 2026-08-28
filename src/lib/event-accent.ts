import type { ScannableEvent } from "@/lib/types";

/**
 * The colour an event wears in the Attendance Checker app.
 *
 * Derived from the event's id rather than assigned, so the same event is the
 * same colour on every officer's phone, on every day of a three-day training,
 * and after any reorder of the list. That stability is the point: an officer
 * working two doors at once learns "the teal one" in a morning, and a palette
 * that shuffled on each fetch would teach them nothing.
 *
 * The value is an OKLCH hue angle, fed to the card as --evt. Every hue here is
 * legible at the same lightness and chroma against the dark ground in
 * globals.css, which is why they are a curated list and not a hash modulo 360 —
 * an unconstrained hue lands in the yellows and turns the card's own numerals
 * unreadable.
 */
const EVENT_HUES = [188, 152, 262, 78, 22, 320, 232, 118] as const;

export function accentForEvent(eventId: string): number {
  let hash = 0;
  for (let i = 0; i < eventId.length; i++) {
    hash = (hash * 31 + eventId.charCodeAt(i)) >>> 0;
  }
  return EVENT_HUES[hash % EVENT_HUES.length];
}

/**
 * "Aug 12" for a one-day event, "Aug 12 – 14" inside a month, "Aug 30 – Sep 1"
 * across one. Dates are plain YYYY-MM-DD strings out of Postgres — a DATE
 * column with no time and no zone — so they are split by hand rather than run
 * through `new Date()`, which would read them as UTC midnight and slide them a
 * day backwards for every officer standing in Manila.
 */
export function formatEventDateRange(startDate: string, endDate: string): string {
  const start = parts(startDate);
  const end = parts(endDate);
  if (startDate === endDate) return `${start.month} ${start.day}`;
  if (start.month === end.month && start.year === end.year) {
    return `${start.month} ${start.day} – ${end.day}`;
  }
  return `${start.month} ${start.day} – ${end.month} ${end.day}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parts(isoDate: string): { year: string; month: string; day: number } {
  const [year, month, day] = isoDate.split("-");
  return {
    year,
    month: MONTHS[Number(month) - 1] ?? month,
    day: Number(day),
  };
}

/** Whether `today` (a Manila YYYY-MM-DD) falls inside the event's run. */
export function isRunningToday(event: ScannableEvent, today: string): boolean {
  return today >= event.start_date && today <= event.end_date;
}

/**
 * How many days of the event have elapsed, 1-based, and how many there are —
 * "Day 2 of 3". Only meaningful while the event is running; the caller checks
 * isRunningToday first.
 */
export function eventDayPosition(
  event: ScannableEvent,
  today: string,
): { day: number; total: number } {
  const dayMs = 86_400_000;
  const start = Date.parse(`${event.start_date}T00:00:00Z`);
  const end = Date.parse(`${event.end_date}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  return {
    day: Math.floor((now - start) / dayMs) + 1,
    total: Math.floor((end - start) / dayMs) + 1,
  };
}

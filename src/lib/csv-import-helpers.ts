export function normHeader(h: string): string {
  return h.trim().replace(/^\uFEFF/, "").toLowerCase().replace(/\s+/g, "_");
}

export function colIndex(map: Map<string, number>, ...names: string[]): number | undefined {
  for (const n of names) {
    const i = map.get(n);
    if (i !== undefined) return i;
  }
  return undefined;
}

export function parseMoney(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const MONTH_ABBR = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

const MONTH_FULL = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

// Two-digit years in the legacy exports are all recent (SSS/tax dates,
// hiring dates), never 1900s-adjacent, but we still need *some* pivot rule
// rather than always assuming 20xx. Standard COBOL-era pivot: 00-69 -> 20xx
// (covers up to 2069), 70-99 -> 19xx. Nothing in the real data lands above
// 69, but the rule must exist and be documented rather than silently assumed.
function pivotTwoDigitYear(yy: number): number {
  return yy <= 69 ? 2000 + yy : 1900 + yy;
}

/** True if y-m-d (1-indexed month) is a real calendar date. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
  );
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Accepts, all returning YYYY-MM-DD or null:
 *  - YYYY-MM-DD
 *  - MM/DD/YYYY, MM-DD-YYYY (US ordering — confirmed from real data: values
 *    like 06/20/23 and 07-31-2023 have a day component > 12, ruling out DD/MM)
 *  - MM/DD/YY, MM-DD-YY (two-digit year, see pivotTwoDigitYear)
 *  - D-Mon-YY / D-Mon-YYYY (3-letter English month abbreviation, e.g. 1-Jul-22)
 *  - Month D,YYYY / Month D, YYYY (full English month name, optional space
 *    after the comma, e.g. "June 29,2023", "JULY 1,2023")
 *
 * Deliberately does NOT try to guess at malformed input (bare "JULY" with no
 * day/year, "410", "02/02/026", "05/04.2026", "06/03//2026", etc.) — those
 * are data-entry errors in the source system and must surface as import
 * warnings, not be silently misread.
 */
export function parseFlexibleCsvDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : s;
  }

  // MM/DD/YYYY or MM-DD-YYYY (4-digit year)
  const mdyLong = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (mdyLong) {
    const month = Number(mdyLong[1]);
    const day = Number(mdyLong[2]);
    const year = Number(mdyLong[3]);
    return isRealDate(year, month, day) ? toIso(year, month, day) : null;
  }

  // MM/DD/YY or MM-DD-YY (2-digit year)
  const mdyShort = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/.exec(s);
  if (mdyShort) {
    const month = Number(mdyShort[1]);
    const day = Number(mdyShort[2]);
    const year = pivotTwoDigitYear(Number(mdyShort[3]));
    return isRealDate(year, month, day) ? toIso(year, month, day) : null;
  }

  // D-Mon-YY or D-Mon-YYYY, e.g. "1-Jul-22"
  const dMonY = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(s);
  if (dMonY) {
    const day = Number(dMonY[1]);
    const monthIdx = MONTH_ABBR.indexOf(dMonY[2].toLowerCase() as (typeof MONTH_ABBR)[number]);
    if (monthIdx < 0) return null;
    const yearRaw = dMonY[3];
    const year = yearRaw.length === 2 ? pivotTwoDigitYear(Number(yearRaw)) : Number(yearRaw);
    return isRealDate(year, monthIdx + 1, day) ? toIso(year, monthIdx + 1, day) : null;
  }

  // Month D,YYYY or Month D, YYYY, e.g. "June 29,2023", "JULY 1,2023"
  const monthDY = /^([A-Za-z]+)\s+(\d{1,2}),\s?(\d{4})$/.exec(s);
  if (monthDY) {
    const monthIdx = MONTH_FULL.indexOf(monthDY[1].toLowerCase() as (typeof MONTH_FULL)[number]);
    if (monthIdx < 0) return null;
    const day = Number(monthDY[2]);
    const year = Number(monthDY[3]);
    return isRealDate(year, monthIdx + 1, day) ? toIso(year, monthIdx + 1, day) : null;
  }

  return null;
}

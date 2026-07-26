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

/** Accepts YYYY-MM-DD or MM/DD/YYYY (US). Returns YYYY-MM-DD or null. */
export function parseFlexibleCsvDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : s;
  }

  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day)
      return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

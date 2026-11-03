const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Formats leave dates ("YYYY-MM-DD") grouped by month for CSC Form 6, e.g.
 * "July 1,2,3,6 2026 and October 27,28 2026". Input order and duplicates
 * don't matter. Pure string math — no Date objects, so no timezone drift.
 */
export function formatGroupedLeaveDates(dates: string[]): string {
  const sorted = [...new Set(dates)].sort();
  const groups: { key: string; label: string; days: number[] }[] = [];
  for (const d of sorted) {
    const [y, m, day] = d.split("-");
    const key = `${y}-${m}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: `${MONTHS[Number(m) - 1]} {days} ${y}`, days: [] };
      groups.push(g);
    }
    g.days.push(Number(day));
  }
  const parts = groups.map((g) => g.label.replace("{days}", g.days.join(",")));
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

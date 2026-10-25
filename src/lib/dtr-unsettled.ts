// The warning a DTR screen shows when some days still have blank punches.
//
// A blank cell is unsettled, not charged (migration 092): it prints blank on
// the CSC Form 48 and costs nothing until the employee settles it through a
// correction. The officer printing the DTR should know which days those are.

interface UnsettledInput {
  employee: { first_name: string; last_name: string };
  entries: { date: string; unsettled_slots?: readonly string[] }[];
}

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

export function unsettledNotice(results: UnsettledInput[]): string | null {
  const perEmployee = results
    .map((r) => ({
      name: [r.employee.last_name, r.employee.first_name].filter(Boolean).join(", "),
      dates: r.entries
        .filter((e) => (e.unsettled_slots?.length ?? 0) > 0)
        .map((e) => e.date),
    }))
    .filter((r) => r.dates.length > 0);
  if (perEmployee.length === 0) return null;

  const days = perEmployee.reduce((n, r) => n + r.dates.length, 0);
  const dayWord = days === 1 ? "day" : "days";
  if (perEmployee.length === 1) {
    const { name, dates } = perEmployee[0];
    return `${name} has ${days} ${dayWord} with blank punches to settle: ${dates
      .map(shortDate)
      .join(", ")}.`;
  }
  return `${days} ${dayWord} across ${perEmployee.length} employees have blank punches to settle.`;
}

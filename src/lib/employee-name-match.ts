/** Fields needed to match CSC / HRIS employee names against employees table rows. */
export type EmployeeNameRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  status: string | null;
};

/** Same display rule as employee list columns: Last[, Suffix], First[, M.] */
export function formatEmployeeDisplayName(emp: Pick<EmployeeNameRow, "first_name" | "middle_name" | "last_name" | "suffix">): string {
  const parts: string[] = [emp.last_name, emp.first_name];
  if (emp.suffix) parts[0] = `${emp.last_name} ${emp.suffix}`;
  if (emp.middle_name) parts.push(emp.middle_name.charAt(0) + ".");
  return parts.join(", ");
}

export function normalizeNameForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sorted token key so "juan cruz dela" matches "dela cruz juan" */
function tokenSortKey(normalized: string): string {
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function buildNormalizedVariants(
  emp: Pick<EmployeeNameRow, "first_name" | "middle_name" | "last_name" | "suffix">
): Set<string> {
  const set = new Set<string>();
  set.add(normalizeNameForMatch(formatEmployeeDisplayName(emp)));

  const natural = [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ");
  set.add(normalizeNameForMatch(emp.suffix ? `${natural} ${emp.suffix}`.trim() : natural));
  set.add(normalizeNameForMatch([emp.first_name, emp.last_name].join(" ")));
  set.add(normalizeNameForMatch(`${emp.last_name}, ${emp.first_name}`));
  if (emp.middle_name) {
    set.add(
      normalizeNameForMatch(
        [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ")
      )
    );
  }
  return set;
}

export function findEmployeeBySearchedName(
  searchedRaw: string,
  employees: EmployeeNameRow[]
): { id: string; matchedName: string } | null {
  const trimmed = searchedRaw.trim();
  if (!trimmed) return null;

  const n = normalizeNameForMatch(trimmed);
  if (!n) return null;

  const candidates: EmployeeNameRow[] = [];

  for (const emp of employees) {
    const variants = buildNormalizedVariants(emp);
    if (variants.has(n)) candidates.push(emp);
  }

  if (candidates.length === 1) {
    return { id: candidates[0].id, matchedName: formatEmployeeDisplayName(candidates[0]) };
  }

  if (candidates.length > 1) {
    const sorted = [...candidates].sort((a, b) => {
      const sa = (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1);
      if (sa !== 0) return sa;
      return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
    });
    return { id: sorted[0].id, matchedName: formatEmployeeDisplayName(sorted[0]) };
  }

  const sortKey = tokenSortKey(n);
  const tokenMatches: EmployeeNameRow[] = [];
  for (const emp of employees) {
    const natural = [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ");
    const ns = normalizeNameForMatch(emp.suffix ? `${natural} ${emp.suffix}`.trim() : natural);
    if (tokenSortKey(ns) === sortKey) tokenMatches.push(emp);
  }

  if (tokenMatches.length === 1) {
    return { id: tokenMatches[0].id, matchedName: formatEmployeeDisplayName(tokenMatches[0]) };
  }
  if (tokenMatches.length > 1) {
    const sorted = [...tokenMatches].sort((a, b) => {
      const sa = (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1);
      if (sa !== 0) return sa;
      return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
    });
    return { id: sorted[0].id, matchedName: formatEmployeeDisplayName(sorted[0]) };
  }

  return null;
}

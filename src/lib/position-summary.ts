/**
 * Groups plantilla items into one row per position title for the Position
 * Summary report (`/reports/positions`).
 *
 * The source is `hris.plantilla`, not `hris.positions` — the latter is empty in
 * production; every item, its title and its incumbent live in plantilla.
 *
 * Pure and DOM-free so it can be unit tested under `node --test`.
 */

export interface PositionIncumbent {
  id: string;
  id_number: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  status: string;
  employment_type: string;
  departments: { name: string } | null;
}

export interface PositionItem {
  id: string;
  item_number: string | null;
  position_title: string | null;
  organizational_unit: string | null;
  salary_grade: number | null;
  step: number | null;
  /** Appointment status code from the CSC plantilla (P, CT, E, …). */
  status: string | null;
  is_vacant: boolean;
  is_funded: boolean;
  actual_annual_salary: number | null;
  date_of_original_appointment: string | null;
  employees: PositionIncumbent | null;
}

export interface PositionSummaryRow {
  key: string;
  title: string;
  minSalaryGrade: number | null;
  maxSalaryGrade: number | null;
  total: number;
  filled: number;
  vacant: number;
  unfunded: number;
  /** Items with a linked employee, sorted by surname. */
  incumbents: PositionItem[];
}

export const UNTITLED_POSITION = "(No position title)";

/** Legacy titles carry stray spacing and mixed case; group on a normalized key. */
export function positionKey(title: string | null): string {
  const cleaned = (title ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  return cleaned || UNTITLED_POSITION;
}

function compareIncumbents(a: PositionItem, b: PositionItem): number {
  const ea = a.employees!;
  const eb = b.employees!;
  return (
    ea.last_name.localeCompare(eb.last_name) ||
    ea.first_name.localeCompare(eb.first_name) ||
    (a.item_number ?? "").localeCompare(b.item_number ?? "")
  );
}

export function summarizePositions(items: PositionItem[]): PositionSummaryRow[] {
  const groups = new Map<string, PositionSummaryRow>();

  for (const item of items) {
    const key = positionKey(item.position_title);
    let row = groups.get(key);
    if (!row) {
      row = {
        key,
        title: key,
        minSalaryGrade: null,
        maxSalaryGrade: null,
        total: 0,
        filled: 0,
        vacant: 0,
        unfunded: 0,
        incumbents: [],
      };
      groups.set(key, row);
    }

    row.total += 1;
    if (item.is_vacant) row.vacant += 1;
    else row.filled += 1;
    if (!item.is_funded) row.unfunded += 1;
    if (item.employees) row.incumbents.push(item);

    const sg = item.salary_grade;
    if (sg !== null) {
      row.minSalaryGrade = row.minSalaryGrade === null ? sg : Math.min(row.minSalaryGrade, sg);
      row.maxSalaryGrade = row.maxSalaryGrade === null ? sg : Math.max(row.maxSalaryGrade, sg);
    }
  }

  const rows = [...groups.values()];
  for (const row of rows) row.incumbents.sort(compareIncumbents);
  return rows.sort((a, b) => a.title.localeCompare(b.title));
}

/** "11", "11–13", or "" when no item carries a grade. */
export function formatSalaryGradeRange(row: PositionSummaryRow): string {
  if (row.minSalaryGrade === null || row.maxSalaryGrade === null) return "";
  return row.minSalaryGrade === row.maxSalaryGrade
    ? String(row.minSalaryGrade)
    : `${row.minSalaryGrade}–${row.maxSalaryGrade}`;
}

/** "ADMINISTRATIVE AIDE IV (DRIVER II)" -> "administrative-aide-iv-driver-ii". */
export function positionFileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "position"
  );
}

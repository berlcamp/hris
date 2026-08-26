/**
 * Coerces an identifier column to a trimmed string, or null.
 *
 * This exists because the registry id columns are not reliably text. Migration
 * 001 declares `hris.employees.employee_no` as TEXT, but the production
 * database holds an `integer` there — the schema drifted at some point, and
 * PostgREST faithfully returns a JSON number. A bare `.trim()` on that throws,
 * and it throws in the browser at the moment somebody is trying to print ID
 * cards.
 *
 * So nothing read out of employee_no / id_number / cos_no is trusted to already
 * be a string. Deliberately kept dependency-free so it can be unit tested.
 */
export function idText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

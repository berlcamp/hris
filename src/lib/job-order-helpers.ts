/**
 * Pure helpers for the Job Orders module.
 *
 * Kept free of Supabase and React imports so they can be unit-tested directly
 * with node:test (see supabase/tests/job-order-helpers.test.mts).
 */

/**
 * Collapse whitespace runs and trim.
 *
 * Postgres `\s` in en_US.UTF-8 locale is locale-aware and matches the same
 * Unicode whitespace as JavaScript's `\s`, with one exception: U+FEFF (BOM).
 * Postgres `\s` does not match U+FEFF, but JavaScript `\s` does. To match
 * Postgres behaviour exactly, we use [^\S﻿] (whitespace excluding U+FEFF) for
 * the collapse pass. We trim with ASCII space only (/^ +| +$/g) to match
 * Postgres btrim() default behaviour.
 * This function must produce identical output to the normalizeAreaName SQL
 * generated column so the CSV importer can reliably match existing areas
 * and avoid duplicates.
 */
function squash(s: string): string {
  return s.replace(/[^\S﻿]+/g, " ").replace(/^ +| +$/g, "");
}

/**
 * Derive a surname-first ordering key from a full name.
 *
 * A name containing a comma is assumed to already be surname-first and is only
 * normalized. Otherwise the last whitespace-separated token is moved to the
 * front. The rule is heuristic: `full_name` is never rewritten, so a wrong
 * guess misorders a row but can never corrupt a name on a printed payroll.
 */
export function deriveSortName(fullName: string): string {
  const s = squash(fullName).toLowerCase();
  if (!s) return "";
  if (s.includes(",")) return s;

  const parts = s.split(" ");
  if (parts.length < 2) return s;

  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1);
  return [last, ...rest].join(" ");
}

/**
 * Render the two legacy address parts as one display string. The legacy columns
 * default to '' rather than NULL, so blanks are treated as absent.
 */
export function formatJoAddress(
  purok: string | null,
  barangay: string | null,
): string {
  return [purok, barangay]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join(", ");
}

/**
 * Must produce the same value as the `normalized_name` generated column on
 * hris.job_order_areas, so the importer can match areas before inserting.
 */
export function normalizeAreaName(name: string): string {
  return squash(name).toLowerCase();
}

/**
 * Legacy `jos.has_atm` is char(50) and holds any of 1/0/Yes/No/Y/N/true/false.
 * Anything unrecognized is false — an unknown value must not silently grant
 * someone an ATM account number they do not have.
 */
export function parseJoBoolean(raw: string): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "1" || v === "yes" || v === "y" || v === "true";
}

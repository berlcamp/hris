/**
 * Helpers for building PostgREST filter strings safely.
 *
 * The defect this module exists to prevent: PostgREST splits `.or(...)`'s
 * argument on TOP-LEVEL COMMAS, so a search term containing a comma breaks one
 * filter fragment into two invalid ones and PostgREST answers 400. It is easy
 * to hit — "Ozamiz, Area 1" in the Job Order payroll list, "Dela Cruz, Juan" in
 * the applicant search — and it fails as a thrown error, not a bad result, so
 * the whole page dies.
 *
 * The fix is to double-quote each value, which protects any embedded comma, and
 * to backslash-escape `\` and `"` inside it so they cannot terminate that quote
 * early. This was originally fixed inline in the Job Order payroll module and
 * then found again, unfixed, in `rsp-actions.ts` — hence one shared builder
 * rather than a rule to remember at each call site.
 *
 * Relative imports WITH the .ts extension where this module needs them, so
 * supabase/tests can import it under Node's plain ESM loader.
 */

/**
 * Quote-escape a value for embedding inside a double-quoted PostgREST filter
 * fragment. Order matters: backslashes first, otherwise the backslashes added
 * for the quotes get escaped a second time.
 */
export function escapeOrFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * An `.or(...)` argument matching `term` case-insensitively against every
 * column in `columns`, as a substring.
 *
 * Prefer this over hand-building the string: it is the comma-safety guarantee
 * in one place. `term` is wrapped in `%...%` here, so pass the bare search
 * text.
 */
export function buildIlikeOrFilter(columns: string[], term: string): string {
  const value = escapeOrFilterValue(`%${term}%`);
  return columns.map((column) => `${column}.ilike."${value}"`).join(",");
}

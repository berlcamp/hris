// Merge-field resolution for printed COS contracts.
//
// Tokens live in the contract body as PLAIN TEXT and stay unresolved in the
// database, so an edited rate or corrected date appears on the next printout
// instead of leaving stale text frozen into the body.
//
// No DOM, no dependencies: supabase/tests/cos-contract-unit.test.mts imports
// this directly under `node --experimental-strip-types`.

import { formatAmountInWords } from "./cos-number-to-words.ts";
import { formatCosEmployeeName } from "./cos-constants.ts";

export interface MergeContext {
  employee: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    cos_no: string;
    address: string | null;
    departmentName: string | null;
  };
  contract: {
    position_title: string | null;
    monthly_rate: number | null;
    period_start: string;
    period_end: string;
    scope_of_work: string | null;
    signatory_name: string | null;
    signatory_position: string | null;
    witness_name: string | null;
    witness_position: string | null;
  };
  /** YYYY-MM-DD. Injected rather than read from the clock so tests are stable. */
  today: string;
}

/** Drives the editor's insert menu. Order is the order shown to the user. */
export const COS_MERGE_FIELDS = [
  { token: "employee_name", label: "Employee name" },
  { token: "employee_first_name", label: "First name" },
  { token: "employee_last_name", label: "Last name" },
  { token: "cos_no", label: "COS number" },
  { token: "position", label: "Position" },
  { token: "department", label: "Department" },
  { token: "address", label: "Address" },
  { token: "period_start", label: "Period start" },
  { token: "period_end", label: "Period end" },
  { token: "monthly_rate", label: "Monthly rate" },
  { token: "monthly_rate_words", label: "Monthly rate in words" },
  { token: "scope_of_work", label: "Scope of work" },
  { token: "signatory_name", label: "Signatory name" },
  { token: "signatory_position", label: "Signatory position" },
  { token: "witness_name", label: "Witness name" },
  { token: "witness_position", label: "Witness position" },
  { token: "today", label: "Today's date" },
] as const;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "2026-01-01" -> "January 1, 2026". Parses the string's own parts rather than
 * constructing a Date, which would apply a timezone offset and can shift the
 * day — the bug class migration 035 exists to fix.
 */
function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return "";
  return `${monthName} ${Number(day)}, ${year}`;
}

function formatPhp(amount: number): string {
  return `PHP ${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildValues(ctx: MergeContext): Record<string, string> {
  const { employee: e, contract: c } = ctx;
  return {
    employee_name: formatCosEmployeeName(e),
    employee_first_name: e.first_name,
    employee_last_name: e.last_name,
    cos_no: e.cos_no,
    position: c.position_title ?? "",
    department: e.departmentName ?? "",
    address: e.address ?? "",
    period_start: formatLongDate(c.period_start),
    period_end: formatLongDate(c.period_end),
    monthly_rate: c.monthly_rate === null ? "" : formatPhp(c.monthly_rate),
    monthly_rate_words:
      c.monthly_rate === null ? "" : formatAmountInWords(c.monthly_rate),
    scope_of_work: c.scope_of_work ?? "",
    signatory_name: c.signatory_name ?? "",
    signatory_position: c.signatory_position ?? "",
    witness_name: c.witness_name ?? "",
    witness_position: c.witness_position ?? "",
    today: formatLongDate(ctx.today),
  };
}

const TOKEN_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Replaces every {{token}} in `text`. An unknown token or a null value becomes
 * an empty string — a printed contract must never show raw {{...}} to a
 * signatory.
 *
 * `Object.hasOwn` (not `values[token] ?? ""`) is deliberate: `values[token]`
 * reads through the prototype chain, so a token like `{{constructor}}` or
 * `{{__proto__}}` — both of which match the `[a-z_]+` token pattern — would
 * resolve to `Object.prototype.constructor`/`.__proto__` instead of falling
 * through to the empty-string default, printing
 * "function Object() { [native code] }" or "[object Object]" into a legal
 * document. `Object.hasOwn` only reports true for the plain data keys
 * `buildValues` actually assigns, so any such token still renders empty.
 */
export function resolveMergeFields(text: string, ctx: MergeContext): string {
  const values = buildValues(ctx);
  return text.replace(TOKEN_PATTERN, (_match, token: string) =>
    Object.hasOwn(values, token) ? values[token] : "",
  );
}

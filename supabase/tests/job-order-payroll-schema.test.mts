// Unit tests for the Job Order payroll zod schemas
// (`src/lib/validations/job-order-payroll-schema.ts`).
//
// These schemas are the only thing standing between a form and a raw Postgres
// constraint violation, so what they reject matters as much as what they
// accept. Two behaviours in particular are pinned here because both were
// silently wrong before this pass and neither is reachable from a `type="date"`
// or `type="number"` input, meaning nothing else would notice a regression:
//
//   * `period_start`/`period_end`/`payroll_date` must reject a well-formed but
//     calendar-invalid date. The old `^\d{4}-\d{2}-\d{2}$` regex accepted
//     `2026-02-30`, which Postgres then rejected on insert — producing exactly
//     the raw-constraint-error UX the period refinement exists to avoid.
//   * `days`/`hours`/`daily_rate` must REJECT unparseable input rather than
//     coercing it to null. Silently clearing a money field is a worse failure
//     mode than a visible validation error.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  jobOrderPayrollCreateSchema,
  jobOrderPayrollMemberSchema,
  jobOrderPayrollMetadataSchema,
} from "../../src/lib/validations/job-order-payroll-schema.ts";

/** A syntactically valid v4-shaped UUID — zod 4 checks the variant nibble. */
const AREA_ID = "123e4567-e89b-12d3-a456-426614174000";

const validCreate = {
  period_start: "2026-01-01",
  period_end: "2026-01-15",
  area_ids: [AREA_ID],
};

function firstError(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  assert.equal(result.success, false, "expected this input to be rejected");
  return result.error!.issues[0]!.message;
}

// ── calendar-valid dates ─────────────────────────────────────────────

test("a valid period is accepted", () => {
  const result = jobOrderPayrollCreateSchema.safeParse(validCreate);
  assert.equal(result.success, true);
});

test("period_start rejects a day-of-month overflow", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    period_start: "2026-02-30",
  });
  assert.equal(firstError(result), "Use a valid date");
});

test("period_start rejects month 13", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    period_start: "2026-13-01",
  });
  assert.equal(firstError(result), "Use a valid date");
});

test("period_start rejects Feb 29 of a non-leap year", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    period_start: "2026-02-29",
  });
  assert.equal(firstError(result), "Use a valid date");
});

test("a real leap day is still accepted", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    period_start: "2028-02-29",
    period_end: "2028-03-01",
  });
  assert.equal(result.success, true);
});

test("period_end before period_start is rejected on the period_end field", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    period_start: "2026-01-15",
    period_end: "2026-01-01",
  });
  assert.equal(firstError(result), "Period end must not be before period start");
  assert.deepEqual(result.error!.issues[0]!.path, ["period_end"]);
});

test("an equal period start and end is accepted — a one-day payroll", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    period_start: "2026-01-05",
    period_end: "2026-01-05",
  });
  assert.equal(result.success, true);
});

// ── payroll_date: "" / null / undefined all collapse to null ─────────
//
// The form's date input yields "" when cleared, the server action may pass
// null, and the field may be absent entirely. All three must reach Postgres as
// NULL, and a real date must survive unchanged.

test("payroll_date collapses an empty string to null", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    payroll_date: "",
  });
  assert.equal(result.success, true);
  assert.equal(result.data!.payroll_date, null);
});

test("payroll_date collapses null to null", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    payroll_date: null,
  });
  assert.equal(result.success, true);
  assert.equal(result.data!.payroll_date, null);
});

test("payroll_date collapses undefined to null", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    payroll_date: undefined,
  });
  assert.equal(result.success, true);
  assert.equal(result.data!.payroll_date, null);
});

test("payroll_date keeps a real date", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    payroll_date: "2026-01-20",
  });
  assert.equal(result.success, true);
  assert.equal(result.data!.payroll_date, "2026-01-20");
});

test("payroll_date rejects a calendar-invalid date rather than nulling it", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    payroll_date: "2026-02-30",
  });
  assert.equal(firstError(result), "Use a valid date");
});

// ── optionalNonNegative: rejects garbage, nulls only real blanks ──────
//
// The divergence this pins: a NEGATIVE number and UNPARSEABLE text must both
// fail, with different messages. Unparseable text used to become null, quietly
// clearing the field.

test("a numeric string is coerced to a number", () => {
  const result = jobOrderPayrollMemberSchema.safeParse({ days: "11" });
  assert.equal(result.success, true);
  assert.equal(result.data!.days, 11);
});

test("zero is accepted, not treated as blank", () => {
  const result = jobOrderPayrollMemberSchema.safeParse({ days: 0 });
  assert.equal(result.success, true);
  assert.equal(result.data!.days, 0);
});

test("a fractional value is preserved — legacy days and hours are floats", () => {
  const result = jobOrderPayrollMemberSchema.safeParse({ hours: 4.5 });
  assert.equal(result.success, true);
  assert.equal(result.data!.hours, 4.5);
});

test("an empty string becomes null", () => {
  const result = jobOrderPayrollMemberSchema.safeParse({ days: "" });
  assert.equal(result.success, true);
  assert.equal(result.data!.days, null);
});

test("null and undefined both become null", () => {
  const fromNull = jobOrderPayrollMemberSchema.safeParse({ days: null });
  assert.equal(fromNull.success, true);
  assert.equal(fromNull.data!.days, null);

  const fromUndefined = jobOrderPayrollMemberSchema.safeParse({});
  assert.equal(fromUndefined.success, true);
  assert.equal(fromUndefined.data!.days, null);
});

test("a negative number is rejected", () => {
  const result = jobOrderPayrollMemberSchema.safeParse({ daily_rate: -1 });
  assert.equal(firstError(result), "Must be zero or more");
});

test("unparseable text is REJECTED, not silently nulled", () => {
  const result = jobOrderPayrollMemberSchema.safeParse({ days: "12x" });
  assert.equal(firstError(result), "Enter a number");
});

test("wholly non-numeric text is rejected too", () => {
  const result = jobOrderPayrollMemberSchema.safeParse({ daily_rate: "abc" });
  assert.equal(firstError(result), "Enter a number");
});

test("the metadata schema shares the same days validation", () => {
  const base = { period_start: "2026-01-01", period_end: "2026-01-15" };
  assert.equal(
    firstError(jobOrderPayrollMetadataSchema.safeParse({ ...base, days: "12x" })),
    "Enter a number",
  );
  const cleared = jobOrderPayrollMetadataSchema.safeParse({ ...base, days: "" });
  assert.equal(cleared.success, true);
  assert.equal(cleared.data!.days, null);
});

// ── optionalText ─────────────────────────────────────────────────────

test("description trims and collapses an empty string to null", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    description: "  ",
    particulars: "  July 1-15  ",
  });
  assert.equal(result.success, true);
  assert.equal(result.data!.description, null);
  assert.equal(result.data!.particulars, "July 1-15");
});

// ── area_ids ─────────────────────────────────────────────────────────

test("at least one area is required", () => {
  const result = jobOrderPayrollCreateSchema.safeParse({
    ...validCreate,
    area_ids: [],
  });
  assert.equal(firstError(result), "Select at least one area");
});

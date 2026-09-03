import { z } from "zod";

/**
 * `z.iso.date()`, not a `^\d{4}-\d{2}-\d{2}$` regex: the regex shape-checks
 * only, so it admits `2026-02-30` and `2026-13-01`. Postgres then rejects them
 * on insert, producing exactly the raw-constraint-violation UX that the
 * `period_end >= period_start` refinement below exists to avoid, one field
 * over. `z.iso.date()` validates the actual calendar date.
 */
const isoDate = z.iso.date("Use a valid date");

/** A date field that may be left blank — "", null and undefined all mean null. */
const optionalIsoDate = isoDate
  .optional()
  .nullable()
  .or(z.literal(""))
  .transform((v) => (v == null || v === "" ? null : v));

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? null : v));

/** Non-negative money/quantity field that accepts "" from an empty input. */
const optionalNonNegative = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  // Unparseable input is REJECTED here, before the transform below can coerce
  // it. It used to fall through to `Number.isFinite(n) ? n : null`, so "12x"
  // silently became null — quietly clearing a money field is the wrong failure
  // mode even if `type="number"` inputs make it hard to reach from the UI.
  .refine(
    (v) =>
      v == null ||
      v === "" ||
      Number.isFinite(typeof v === "number" ? v : Number(v)),
    "Enter a number",
  )
  .transform((v) => {
    if (v == null || v === "") return null;
    return typeof v === "number" ? v : Number(v);
  })
  .refine((v) => v == null || v >= 0, "Must be zero or more");

export const jobOrderPayrollMetadataSchema = z
  .object({
    period_start: isoDate,
    period_end: isoDate,
    days: optionalNonNegative,
    description: optionalText,
    particulars: optionalText,
    payroll_date: optionalIsoDate,
  })
  // Mirrors chk_job_order_payroll_period so the user sees a field error
  // instead of a raw Postgres constraint violation.
  .refine((v) => v.period_end >= v.period_start, {
    message: "Period end must not be before period start",
    path: ["period_end"],
  });

export type JobOrderPayrollMetadataValues = z.infer<
  typeof jobOrderPayrollMetadataSchema
>;

export const jobOrderPayrollCreateSchema = z
  .object({
    period_start: isoDate,
    period_end: isoDate,
    days: optionalNonNegative,
    description: optionalText,
    particulars: optionalText,
    payroll_date: optionalIsoDate,
    area_ids: z.array(z.string().uuid()).min(1, "Select at least one area"),
  })
  .refine((v) => v.period_end >= v.period_start, {
    message: "Period end must not be before period start",
    path: ["period_end"],
  });

export type JobOrderPayrollCreateValues = z.infer<
  typeof jobOrderPayrollCreateSchema
>;

/**
 * The three per-row editable values. `daily_rate` is editable because it is a
 * snapshot — correcting a wrongly stamped rate on the payroll is
 * legitimate, and it never writes back to hris.job_order_employees.
 */
export const jobOrderPayrollMemberSchema = z.object({
  days: optionalNonNegative,
  hours: optionalNonNegative,
  daily_rate: optionalNonNegative,
});

export type JobOrderPayrollMemberValues = z.infer<
  typeof jobOrderPayrollMemberSchema
>;

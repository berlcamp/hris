import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

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
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  })
  .refine((v) => v == null || v >= 0, "Must be zero or more");

export const jobOrderPayrollMetadataSchema = z
  .object({
    period_start: isoDate,
    period_end: isoDate,
    days: optionalNonNegative,
    description: optionalText,
    particulars: optionalText,
    payroll_date: isoDate.optional().nullable().or(z.literal("")).transform(
      (v) => (v == null || v === "" ? null : v),
    ),
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
    payroll_date: isoDate.optional().nullable().or(z.literal("")).transform(
      (v) => (v == null || v === "" ? null : v),
    ),
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
 * snapshot — correcting a wrongly stamped rate before finalizing is
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

import { z } from "zod";

/**
 * `z.iso.date()`, not a `^\d{4}-\d{2}-\d{2}$` regex — same reasoning as
 * job-order-payroll-schema.ts: the regex shape-checks only, so it admits
 * `2026-02-30` and lets Postgres produce a raw constraint violation instead of
 * a field error.
 */
const isoDate = z.iso.date("Use a valid date");

const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max);

const optionalText = z
  .string()
  .trim()
  .max(300)
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? null : v));

/** Non-negative money field that accepts "" from an empty number input. */
const optionalNonNegative = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
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

/** The four editable header fields, plus the body's period phrase. */
export const jobOrderMemoMetadataSchema = z.object({
  subject: requiredText(500, "Subject is required"),
  memo_date: isoDate,
  memo_type: z.enum(["new", "retain"]),
  memo_no: optionalText,
  period_covered: optionalText,
});

export type JobOrderMemoMetadataValues = z.infer<
  typeof jobOrderMemoMetadataSchema
>;

/**
 * Duplicating asks for the four heading fields only. `memo_type` is absent on
 * purpose: the copy is the same template as its source, and the action reads
 * it off the source row rather than trusting a hidden field the dialog would
 * have to carry around.
 */
export const jobOrderMemoDuplicateSchema = jobOrderMemoMetadataSchema.omit({
  memo_type: true,
});

export type JobOrderMemoDuplicateValues = z.infer<
  typeof jobOrderMemoDuplicateSchema
>;

/** Creating a memo also picks the Job Order employees it covers. */
export const jobOrderMemoCreateSchema = jobOrderMemoMetadataSchema.extend({
  employee_ids: z
    .array(z.string().uuid())
    .min(1, "Select at least one Job Order employee"),
});

export type JobOrderMemoCreateValues = z.infer<typeof jobOrderMemoCreateSchema>;

/**
 * The two per-row editable values. Both are snapshots, so correcting a wrongly
 * stamped office assignment or rate before the memo is issued is legitimate —
 * neither ever writes back to hris.job_order_employees.
 */
export const jobOrderMemoMemberSchema = z.object({
  office_assignment: optionalText,
  daily_rate: optionalNonNegative,
});

export type JobOrderMemoMemberValues = z.infer<typeof jobOrderMemoMemberSchema>;

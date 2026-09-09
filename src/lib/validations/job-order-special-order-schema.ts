import { z } from "zod";

/**
 * `z.iso.date()`, not a `^\d{4}-\d{2}-\d{2}$` regex — same reasoning as
 * job-order-memo-schema.ts: the regex shape-checks only, so it admits
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

/** The three editable header fields, plus the body's effectivity phrase. */
export const jobOrderSpecialOrderMetadataSchema = z.object({
  subject: requiredText(500, "Subject is required"),
  so_date: isoDate,
  so_no: optionalText,
  period_covered: optionalText,
});

export type JobOrderSpecialOrderMetadataValues = z.infer<
  typeof jobOrderSpecialOrderMetadataSchema
>;

/**
 * Duplicating asks for the same heading fields. Unlike the memorandum there is
 * no template discriminator to inherit — a Special Order has one form.
 */
export const jobOrderSpecialOrderDuplicateSchema =
  jobOrderSpecialOrderMetadataSchema;

export type JobOrderSpecialOrderDuplicateValues = z.infer<
  typeof jobOrderSpecialOrderDuplicateSchema
>;

/** Creating an order also picks the Job Order employees it directs. */
export const jobOrderSpecialOrderCreateSchema =
  jobOrderSpecialOrderMetadataSchema.extend({
    employee_ids: z
      .array(z.string().uuid())
      .min(1, "Select at least one Job Order employee"),
  });

export type JobOrderSpecialOrderCreateValues = z.infer<
  typeof jobOrderSpecialOrderCreateSchema
>;

/**
 * The one per-row editable value. It is a snapshot, so correcting a wrongly
 * stamped area before the order is issued is legitimate — it never writes back
 * to hris.job_order_employees.
 */
export const jobOrderSpecialOrderMemberSchema = z.object({
  area_assigned: optionalText,
});

export type JobOrderSpecialOrderMemberValues = z.infer<
  typeof jobOrderSpecialOrderMemberSchema
>;

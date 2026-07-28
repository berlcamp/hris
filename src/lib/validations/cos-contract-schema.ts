import { z } from "zod";

// No import from cos-constants here: `status` is NOT a form field. It is set
// only by terminateCosContract, never typed by a user, so importing
// COS_CONTRACT_STATUSES would be an unused import and a lint error.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const optionalText = z
  .string()
  .transform((v) => (v.trim() === "" ? null : v.trim()))
  .nullable()
  .optional();

const requiredIsoDate = z
  .string()
  .regex(ISO_DATE, "Use a valid date (YYYY-MM-DD)");

const optionalRate = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "string" && v.trim() === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), {
    message: "Enter a valid monthly rate",
  })
  .nullable()
  .optional();

// The Tiptap document. Validated as a shape, not a schema: the editor is the
// only author, and rejecting an unrecognised node here would make a body
// unsavable that contractDocToBlocks would happily drop at print time.
const tiptapDoc = z
  .object({ type: z.literal("doc") })
  .passthrough();

export const cosContractFormSchema = z
  .object({
    cos_employee_id: z.string().uuid("Select a COS employee"),
    period_start: requiredIsoDate,
    period_end: requiredIsoDate,
    monthly_rate: optionalRate,
    position_title: optionalText,
    scope_of_work: optionalText,
    signatory_name: optionalText,
    signatory_position: optionalText,
    witness_name: optionalText,
    witness_position: optionalText,
    template_id: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    body: tiptapDoc,
  })
  // Mirrors the cos_contracts_period_order CHECK so the user sees a field
  // error instead of a Postgres message.
  .refine((v) => v.period_end >= v.period_start, {
    message: "End date must be on or after the start date",
    path: ["period_end"],
  });

export type CosContractFormValues = z.infer<typeof cosContractFormSchema>;

export const cosContractTemplateFormSchema = z.object({
  name: z.string().trim().min(1, "Template name is required"),
  description: optionalText,
  is_active: z.boolean().default(true),
  body: tiptapDoc,
});

export type CosContractTemplateFormValues = z.infer<
  typeof cosContractTemplateFormSchema
>;

export const cosContractTerminationSchema = z.object({
  terminated_on: requiredIsoDate,
  termination_reason: z.string().trim().min(1, "A reason is required"),
});

export type CosContractTerminationValues = z.infer<
  typeof cosContractTerminationSchema
>;

import { z } from "zod";

export const jobOrderAreaSchema = z.object({
  name: z.string().trim().min(1, "Area name is required").max(255),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});

export type JobOrderAreaValues = z.infer<typeof jobOrderAreaSchema>;

const optionalText = z.string().trim().max(255).optional().or(z.literal(""));

// zod v4: the v3 `invalid_type_error` option was removed — use `{ message }`.
// `z.coerce` matches how employee-schema.ts handles numeric inputs, which
// arrive from <Input type="number"> as strings. Plain z.coerce.number()
// coerces "" to 0 (Number("") === 0), which would silently save "not
// specified" as an actual zero peso rate — unacceptable in a payroll module.
// Mirrors the `optionalNonNegNumber` pattern in rsp-schema.ts: union of a
// literal "" and a coerced number, transformed to null on the empty branch.
// IMPORTANT: z.literal("") must come FIRST in the union — zod tries options
// in order and z.coerce.number() itself would otherwise swallow "" as 0
// before the literal branch is ever reached.
const optionalMoney = z
  .preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? "" : val),
    z.union([
      z.literal(""),
      z.coerce.number({ message: "Must be a number" }).nonnegative("Must be zero or more"),
    ]),
  )
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const jobOrderEmployeeSchema = z
  .object({
    full_name: z.string().trim().min(1, "Full name is required").max(255),
    sex: z.enum(["male", "female"]).nullable().optional(),
    purok: optionalText,
    barangay: optionalText,
    area_id: z.string().uuid("Area Assignment is required"),
    sub_area: optionalText,
    daily_rate: optionalMoney,
    // A legacy shift descriptor ("7:00 PM - 7:00 AM"), not a number — see
    // migration 061. Plain optional free text, same shape as `sub_area`.
    working_hours: optionalText,
    date_started: z.string().optional().or(z.literal("")),
    eligibility: optionalText,
    recommended_by: optionalText,
    remarks: z.string().trim().max(1000).optional().or(z.literal("")),
    remarks_2: z.string().trim().max(1000).optional().or(z.literal("")),
    has_atm: z.boolean().default(false),
    landbank_account_number: optionalText,
    sss_no: optionalText,
    sss_ss: optionalMoney,
    sss_ec: optionalMoney,
    community_tax_number: optionalText,
    community_tax_date: z.string().optional().or(z.literal("")),
    community_tax_place_issued: optionalText,
    status: z.enum(["active", "inactive"]).default("active"),
  })
  // Mirrors the chk_job_order_atm_account constraint in migration 056. Keeping
  // both means a bad payload is rejected by the form AND by the database.
  .refine(
    (v) => v.has_atm || !v.landbank_account_number,
    {
      message: "Clear the account number, or set Has ATM to Yes",
      path: ["landbank_account_number"],
    },
  )
  .refine(
    (v) => !v.has_atm || !!v.landbank_account_number?.trim(),
    {
      message: "LandBank account number is required when Has ATM is Yes",
      path: ["landbank_account_number"],
    },
  );

export type JobOrderEmployeeValues = z.infer<typeof jobOrderEmployeeSchema>;

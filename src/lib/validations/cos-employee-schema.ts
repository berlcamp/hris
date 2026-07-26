import { z } from "zod";
// Relative import (not the "@/" alias): the Node test runner
// (`node --experimental-strip-types`) loads this module directly for
// supabase/tests/cos-unit.test.mts and cannot resolve the "@/" path alias,
// which only Next.js's bundler understands.
import { COS_EMPLOYEE_STATUSES, COS_SEXES } from "../cos-constants.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Blank text inputs arrive as "" from the DOM; store NULL instead so the
// database never holds an empty string alongside real absences.
const optionalText = z
  .string()
  .transform((v) => (v.trim() === "" ? null : v.trim()))
  .nullable()
  .optional();

const optionalIsoDate = z
  .string()
  .regex(ISO_DATE, "Use a valid date (YYYY-MM-DD)")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const cosEmployeeFormSchema = z.object({
  cos_no: z.string().trim().min(1, "COS number is required"),
  first_name: z.string().trim().min(1, "First name is required"),
  middle_name: optionalText,
  last_name: z.string().trim().min(1, "Last name is required"),
  suffix: optionalText,

  sex: z
    .enum(COS_SEXES)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  birth_date: optionalIsoDate,
  address: optionalText,
  contact_number: optionalText,
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),

  department_id: z
    .string()
    .uuid("Select a department")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  position_title: optionalText,
  eligibility: optionalText,
  recommended_by: optionalText,
  remarks: optionalText,

  status: z.enum(COS_EMPLOYEE_STATUSES).default("active"),
});

export type CosEmployeeFormValues = z.infer<typeof cosEmployeeFormSchema>;

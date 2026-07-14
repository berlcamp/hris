import { z } from "zod";
import {
  APPOINTMENT_NATURES,
  APPOINTMENT_STATUS_TYPES,
  MIN_POSTING_DAYS,
} from "@/lib/rsp-constants";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

const optionalNonNegNumber = z
  .union([z.coerce.number().min(0, "Must be 0 or more"), z.literal("")])
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const vacancyFormSchema = z.object({
  plantilla_id: z.string().min(1, "Plantilla item is required"),
  item_number: z.string().min(1, "Item number is required"),
  position_title: z.string().min(1, "Position title is required"),
  organizational_unit: optionalText,
  place_of_assignment: optionalText,
  salary_grade: z.coerce
    .number()
    .int()
    .min(1, "Salary grade must be 1-33")
    .max(33, "Salary grade must be 1-33")
    .nullable()
    .optional(),
  monthly_salary: optionalNonNegNumber,
  qs_education: optionalText,
  qs_training: optionalText,
  qs_training_hours: optionalNonNegNumber,
  qs_experience: optionalText,
  qs_experience_years: optionalNonNegNumber,
  qs_eligibility: optionalText,
  remarks: optionalText,
});

export type VacancyFormValues = z.infer<typeof vacancyFormSchema>;
export type VacancyFormInput = z.input<typeof vacancyFormSchema>;

export const publishVacancySchema = z
  .object({
    publication_date: z
      .string()
      .regex(ISO_DATE, "Use a valid date (YYYY-MM-DD)"),
    closing_date: z.string().regex(ISO_DATE, "Use a valid date (YYYY-MM-DD)"),
    csc_bulletin_no: optionalText,
  })
  .refine(
    (d) => {
      const from = new Date(`${d.publication_date}T00:00:00`);
      const to = new Date(`${d.closing_date}T00:00:00`);
      const days =
        Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
      return days >= MIN_POSTING_DAYS;
    },
    {
      message: `Posting must be at least ${MIN_POSTING_DAYS} calendar days (RA 7041)`,
      path: ["closing_date"],
    }
  );

export type PublishVacancyValues = z.infer<typeof publishVacancySchema>;
export type PublishVacancyInput = z.input<typeof publishVacancySchema>;

export const applicantFormSchema = z.object({
  last_name: z.string().min(1, "Last name is required"),
  first_name: z.string().min(1, "First name is required"),
  middle_name: optionalText,
  name_extension: optionalText,
  sex: z
    .enum(["male", "female"])
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  birth_date: optionalIsoDate,
  address: optionalText,
  email: z
    .string()
    .email("Invalid email address")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  mobile_no: optionalText,
  employee_id: optionalText,
  notes: optionalText,
});

export type ApplicantFormValues = z.infer<typeof applicantFormSchema>;
export type ApplicantFormInput = z.input<typeof applicantFormSchema>;

export const applicationFormSchema = z.object({
  vacancy_id: z.string().min(1, "Vacancy is required"),
  applicant_id: z.string().min(1, "Applicant is required"),
  date_received: z.string().regex(ISO_DATE, "Use a valid date (YYYY-MM-DD)"),
  education: optionalText,
  training: optionalText,
  training_hours: optionalNonNegNumber,
  experience: optionalText,
  experience_years: optionalNonNegNumber,
  eligibility: optionalText,
});

export type ApplicationFormValues = z.infer<typeof applicationFormSchema>;
export type ApplicationFormInput = z.input<typeof applicationFormSchema>;

export const screeningSchema = z
  .object({
    result: z.enum(["qualified", "disqualified"]),
    remarks: optionalText,
  })
  .refine((d) => d.result !== "disqualified" || (d.remarks ?? "").length > 0, {
    message: "Remarks are required when disqualifying (state the QS not met)",
    path: ["remarks"],
  });

export type ScreeningValues = z.infer<typeof screeningSchema>;
export type ScreeningInput = z.input<typeof screeningSchema>;

export const criterionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Criterion name is required"),
  weight: z.coerce
    .number()
    .gt(0, "Weight must be greater than 0")
    .max(100, "Weight cannot exceed 100"),
  max_score: z.coerce.number().gt(0, "Max score must be greater than 0"),
  sort_order: z.coerce.number().int().min(0),
});

export const criteriaListSchema = z
  .array(criterionSchema)
  .min(1, "At least one criterion is required")
  .refine(
    (list) =>
      Math.abs(list.reduce((sum, c) => sum + c.weight, 0) - 100) < 0.01,
    { message: "Criterion weights must total exactly 100%" }
  );

export type CriterionValues = z.infer<typeof criterionSchema>;

export const scoreEntriesSchema = z
  .array(
    z.object({
      application_id: z.string().min(1),
      criterion_id: z.string().min(1),
      score: z.coerce.number().min(0, "Score must be 0 or more"),
    })
  )
  .min(1, "No scores to save");

export type ScoreEntry = z.infer<typeof scoreEntriesSchema>[number];

export const appointmentFormSchema = z
  .object({
    application_id: z.string().min(1, "Application is required"),
    nature: z.enum(APPOINTMENT_NATURES),
    nature_others: optionalText,
    status_type: z.enum(APPOINTMENT_STATUS_TYPES),
    vice: optionalText,
    date_of_signing: z
      .string()
      .regex(ISO_DATE, "Use a valid date (YYYY-MM-DD)"),
    employment_period_from: optionalIsoDate,
    employment_period_to: optionalIsoDate,
    appointing_authority: optionalText,
    appointing_authority_position: optionalText,
    remarks: optionalText,
  })
  .refine((d) => d.nature !== "others" || (d.nature_others ?? "").length > 0, {
    message: "Specify the nature of appointment",
    path: ["nature_others"],
  })
  .refine(
    (d) =>
      !["casual", "contractual", "temporary"].includes(d.status_type) ||
      (d.employment_period_from && d.employment_period_to),
    {
      message:
        "Employment period is required for casual, contractual, and temporary appointments",
      path: ["employment_period_from"],
    }
  )
  .refine(
    (d) =>
      !d.employment_period_from ||
      !d.employment_period_to ||
      d.employment_period_to >= d.employment_period_from,
    {
      message: "Period end must be on or after period start",
      path: ["employment_period_to"],
    }
  );

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;
export type AppointmentFormInput = z.input<typeof appointmentFormSchema>;

export const appointmentLifecycleSchema = z.object({
  oath_date: optionalIsoDate,
  assumption_date: optionalIsoDate,
  probation_end_date: optionalIsoDate,
  remarks: optionalText,
});

export type AppointmentLifecycleValues = z.infer<
  typeof appointmentLifecycleSchema
>;
export type AppointmentLifecycleInput = z.input<
  typeof appointmentLifecycleSchema
>;

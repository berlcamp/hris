import { z } from "zod";

export const ctoCreditEntrySchema = z.object({
  employee_id: z.string().min(1, "Employee is required"),
  ot_date: z.string().min(1, "Overtime date is required"),
  day_type: z.enum(["regular", "rest_day", "holiday"]),
  hours_worked: z.coerce
    .number()
    .positive("Hours must be greater than 0")
    .max(24, "Hours cannot exceed 24"),
  office_order_no: z.string().nullable(),
  notes: z.string().nullable(),
});

export type CtoCreditEntryValues = z.infer<typeof ctoCreditEntrySchema>;

export const ctoApplicationSchema = z
  .object({
    employee_id: z.string().min(1, "Employee is required"),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
    hours_applied: z.coerce
      .number()
      .min(4, "Minimum availment is 4 hours (half day)")
      .max(40, "Maximum availment is 40 hours (5 days)")
      .refine((h) => h % 4 === 0, "CTO must be availed in 4-hour blocks"),
    reason: z.string().nullable(),
  })
  .refine((data) => new Date(data.end_date) >= new Date(data.start_date), {
    message: "End date must be on or after start date",
    path: ["end_date"],
  });

export type CtoApplicationFormValues = z.infer<typeof ctoApplicationSchema>;

export const ctoVoidSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
});

export type CtoVoidValues = z.infer<typeof ctoVoidSchema>;

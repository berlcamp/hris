import { z } from "zod";

const salaryChangeReasonZ = z.enum([
  "initial",
  "step_increment",
  "promotion",
  "reclassification",
  "salary_standardization",
  "adjustment",
  "demotion",
]);

export const salaryHistoryEntrySchema = z.object({
  employee_id: z.string().uuid(),
  salary_grade: z.coerce.number().int().min(1).max(33),
  step: z.coerce.number().int().min(1).max(8),
  salary_amount: z.coerce.number().min(0),
  effective_date: z.string().min(1),
  reason: salaryChangeReasonZ,
  remarks: z.string().max(2000).optional().nullable(),
});

export type SalaryHistoryEntryFormValues = z.infer<typeof salaryHistoryEntrySchema>;

export const salaryHistoryUpdateSchema = salaryHistoryEntrySchema.extend({
  id: z.string().uuid(),
});

export type SalaryHistoryUpdateFormValues = z.infer<typeof salaryHistoryUpdateSchema>;

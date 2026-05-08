import { z } from "zod";

const optionalNumber = z.coerce.number().nonnegative().nullable().optional();

export const cosPayrollMetadataSchema = z.object({
  period_start: z.string().min(1, "Period start is required"),
  period_end: z.string().min(1, "Period end is required"),
  particulars: z.string().nullable().optional(),
});

export type CosPayrollMetadataValues = z.infer<typeof cosPayrollMetadataSchema>;

export const cosEmployeePayrollSchema = z.object({
  designation: z.string().nullable().optional(),
  monthly_rate: optionalNumber,
  absent_without_pay: optionalNumber,
  ss_contribution: optionalNumber,
  ss_contribution_ec: optionalNumber,
  percentage_tax_3: optionalNumber,
});

export type CosEmployeePayrollValues = z.infer<typeof cosEmployeePayrollSchema>;

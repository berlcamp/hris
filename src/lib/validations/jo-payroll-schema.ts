import { z } from "zod";

const optionalNumber = z.coerce.number().nonnegative().nullable().optional();

export const joPayrollMetadataSchema = z.object({
  period_start: z.string().min(1, "Period start is required"),
  period_end: z.string().min(1, "Period end is required"),
  description: z.string().nullable().optional(),
  particulars: z.string().nullable().optional(),
  days: optionalNumber,
  payroll_date: z.string().nullable().optional(),
});

export type JoPayrollMetadataValues = z.infer<typeof joPayrollMetadataSchema>;

export const joPayrollMemberSchema = z.object({
  days: optionalNumber,
  hours: optionalNumber,
  rate: optionalNumber,
});

export type JoPayrollMemberValues = z.infer<typeof joPayrollMemberSchema>;

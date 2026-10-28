import { z } from "zod";

import type { JobOrderSignatoryKey } from "@/lib/job-order-signatories";

const signatorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  position: z.string().trim().min(1, "Position is required").max(255),
  office: z.string().trim().max(255),
});

export type JobOrderSignatoryFormValue = z.infer<typeof signatorySchema>;

// Keyed the same as JobOrderSignatories; `office` is a string here ("" for
// none) because it comes straight from an <Input>.
export const jobOrderSignatoriesSchema = z.object({
  city_mayor: signatorySchema,
  city_administrator: signatorySchema,
  payroll_accountant: signatorySchema,
  payroll_certifier: signatorySchema,
  payroll_approver: signatorySchema,
  payroll_treasurer: signatorySchema,
  obr_budget_officer: signatorySchema,
  sss_prepared_by: signatorySchema,
  sss_noted_by: signatorySchema,
} satisfies Record<JobOrderSignatoryKey, typeof signatorySchema>);

export type JobOrderSignatoriesValues = z.infer<typeof jobOrderSignatoriesSchema>;

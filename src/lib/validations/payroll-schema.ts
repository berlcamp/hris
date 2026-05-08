import { z } from "zod";

const optionalNumber = z.coerce
  .number()
  .nonnegative()
  .nullable()
  .optional();

export const payrollMetadataSchema = z.object({
  period_start: z.string().min(1, "Period start is required"),
  period_end: z.string().min(1, "Period end is required"),
  particulars: z.string().nullable().optional(),
  particulars_2nd_half: z.string().nullable().optional(),
});

export type PayrollMetadataValues = z.infer<typeof payrollMetadataSchema>;

export const employeePayrollSchema = z.object({
  designation: z.string().nullable().optional(),
  monthly_rate: optionalNumber,
  sif: optionalNumber,
  withholding_tax: optionalNumber,
  philhealth_personal_share: optionalNumber,
  philhealth_govt_share: optionalNumber,
  gsis_personal_share: optionalNumber,
  gsis_govt_share: optionalNumber,
  pag_ibig_personal_share: optionalNumber,
  pag_ibig_govt_share: optionalNumber,
  hmdf: optionalNumber,
  pag_ibig_salary_loan: optionalNumber,
  ss_contribution: optionalNumber,
  ss_contribution_ec: optionalNumber,
  gsis_repayments_mpl: optionalNumber,
  gsis_repayments_mpl_lite: optionalNumber,
  gsis_repayments_policy_loan: optionalNumber,
  gsis_repayments_cpl: optionalNumber,
  courage_2_contribution: optionalNumber,
  courage_salary_loan: optionalNumber,
  economic_enterprise_multipurpose_coop: optionalNumber,
  eempc_salary_loan: optionalNumber,
  emergency_loan: optionalNumber,
  notice_of_disallowance: optionalNumber,
  economic_enterprise_multipurpose_coop_pera: optionalNumber,
  courage_2_pera_loan: optionalNumber,
  lbp_savings_account_number: z.string().nullable().optional(),
});

export type EmployeePayrollValues = z.infer<typeof employeePayrollSchema>;

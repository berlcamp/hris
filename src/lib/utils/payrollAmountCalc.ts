/**
 * Calculates amount_received and amount_received_2nd_half for regular payroll.
 *
 * amount_earned = (Monthly Salary - Total Deductions), i.e. the net pay.
 * Formula: net_pay / 2
 * - amount_received_2nd_half: floor(half) — no decimals
 * - amount_received: net_pay - amount_received_2nd_half — remainder (can have decimals)
 *
 * Example: 28,872 - 5,292.35 = 23,579.65 = amount_earned
 * 23,579.65 / 2 = 11,789.825
 * amount_received_2nd_half = 11,789 (no decimal)
 * amount_received = 23,579.65 - 11,789 = 11,790.65
 */

const DEDUCTION_KEYS = [
  "withholding_tax",
  "philhealth_personal_share",
  "gsis_personal_share",
  "pag_ibig_personal_share",
  "hmdf",
  "pag_ibig_salary_loan",
  "ss_contribution",
  "ss_contribution_ec",
  "gsis_repayments_mpl",
  "gsis_repayments_mpl_lite",
  "gsis_repayments_policy_loan",
  "gsis_repayments_cpl",
  "courage_2_contribution",
  "courage_salary_loan",
  "economic_enterprise_multipurpose_coop",
  "eempc_salary_loan",
  "emergency_loan",
  "notice_of_disallowance",
] as const;

export interface PayrollAmountInput {
  amount_earned?: number | null;
  monthly_rate?: number | null;
  withholding_tax?: number | null;
  philhealth_personal_share?: number | null;
  gsis_personal_share?: number | null;
  pag_ibig_personal_share?: number | null;
  hmdf?: number | null;
  pag_ibig_salary_loan?: number | null;
  ss_contribution?: number | null;
  ss_contribution_ec?: number | null;
  gsis_repayments_mpl?: number | null;
  gsis_repayments_mpl_lite?: number | null;
  gsis_repayments_policy_loan?: number | null;
  gsis_repayments_cpl?: number | null;
  courage_2_contribution?: number | null;
  courage_salary_loan?: number | null;
  economic_enterprise_multipurpose_coop?: number | null;
  eempc_salary_loan?: number | null;
  emergency_loan?: number | null;
  notice_of_disallowance?: number | null;
}

export interface PayrollAmountResult {
  amount_received: number;
  amount_received_2nd_half: number;
}

export function calculatePayrollAmounts(
  data: PayrollAmountInput,
): PayrollAmountResult | null {
  let netPay: number;
  if (data.amount_earned != null && data.amount_earned > 0) {
    netPay = data.amount_earned;
  } else {
    const monthlyRate = data.monthly_rate ?? 0;
    if (monthlyRate <= 0) return null;
    let totalDeductions = 0;
    for (const key of DEDUCTION_KEYS) {
      totalDeductions += data[key] ?? 0;
    }
    netPay = monthlyRate - totalDeductions;
  }
  if (netPay <= 0) return null;
  const halfAmount = netPay / 2;
  const amount_received_2nd_half = Math.floor(halfAmount);
  const amount_received =
    Math.round((netPay - amount_received_2nd_half) * 100) / 100;

  return { amount_received, amount_received_2nd_half };
}

export function computeAmountEarned(data: PayrollAmountInput): number | null {
  const monthlyRate = data.monthly_rate ?? 0;
  if (monthlyRate <= 0) return null;
  const total = getTotalDeductions(data);
  return monthlyRate - total;
}

export function getTotalDeductions(data: PayrollAmountInput): number {
  let sum = 0;
  for (const key of DEDUCTION_KEYS) {
    sum += data[key] ?? 0;
  }
  return sum;
}

export function computeAmountEarnedFor1stHalfPrint(
  amount_received: number,
  deductions: PayrollAmountInput,
): number {
  return amount_received + getTotalDeductions(deductions);
}

export function totalSsDeduction(
  ss: number | null | undefined,
  ec: number | null | undefined,
): number {
  return (ss ?? 0) + (ec ?? 0);
}

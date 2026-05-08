/**
 * COS (Contract of Service) payroll calculations.
 *
 *   Net Salary = (Monthly Salary − Absent w/o pay) − 5%
 *   Net Amount Received = Net Salary − SSS Contribution (SS + EC) − Percentage Tax 3% (if any)
 */

export const COS_EWT_RATE = 0.05;

export function computeCosEwt(
  monthly_rate: number | null | undefined,
  absent_without_pay?: number | null | undefined,
): number {
  const gross = (monthly_rate ?? 0) - (absent_without_pay ?? 0);
  return Math.max(0, gross) * COS_EWT_RATE;
}

export function computeCosTotalNetSalary(
  monthly_rate: number | null | undefined,
  absent_without_pay: number | null | undefined,
): number {
  return (monthly_rate ?? 0) - (absent_without_pay ?? 0);
}

export function computeCosNetSalary(
  monthly_rate: number | null | undefined,
  absent_without_pay: number | null | undefined,
): number {
  const gross = (monthly_rate ?? 0) - (absent_without_pay ?? 0);
  return gross - computeCosEwt(monthly_rate, absent_without_pay);
}

export interface CosNetInput {
  monthly_rate: number | null | undefined;
  absent_without_pay: number | null | undefined;
  ss_contribution: number | null | undefined;
  ss_contribution_ec: number | null | undefined;
  percentage_tax_3?: number | null | undefined;
}

export function computeCosNetAmount(d: CosNetInput): number {
  const netSalary = computeCosNetSalary(d.monthly_rate, d.absent_without_pay);
  const pctTax = d.percentage_tax_3 ?? 0;
  return (
    netSalary -
    (d.ss_contribution ?? 0) -
    (d.ss_contribution_ec ?? 0) -
    pctTax
  );
}

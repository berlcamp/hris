/**
 * Job Order payroll calculation helpers.
 *
 *   gross_regular   = rate * days
 *   gross_overtime  = (rate / 8) * hours
 *   sss_deduction   = sss_ss + sss_ec
 *   net_amount      = gross - sss_deduction
 *
 * `null` inputs are treated as 0 so partially-filled rows don't NaN-bomb the
 * totals row in print views.
 */

export interface JoPayrollComputeInput {
  rate: number | null | undefined;
  days: number | null | undefined;
  hours?: number | null | undefined;
  sss_ss?: number | null | undefined;
  sss_ec?: number | null | undefined;
}

const n = (v: number | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

export function computeJoGross(
  rate: number | null | undefined,
  days: number | null | undefined,
): number {
  return n(rate) * n(days);
}

export function computeJoOvertimeGross(
  rate: number | null | undefined,
  hours: number | null | undefined,
): number {
  return (n(rate) / 8) * n(hours);
}

export function computeJoSssDeduction(
  sssShare: number | null | undefined,
  ecShare: number | null | undefined,
): number {
  return n(sssShare) + n(ecShare);
}

export function computeJoNetAmount(input: JoPayrollComputeInput): number {
  const gross = computeJoGross(input.rate, input.days);
  const sss = computeJoSssDeduction(input.sss_ss, input.sss_ec);
  return gross - sss;
}

export function computeJoOvertimeNet(
  rate: number | null | undefined,
  hours: number | null | undefined,
): number {
  return computeJoOvertimeGross(rate, hours);
}

export interface JoPayrollMemberLike {
  rate: number | null;
  days: number | null;
  hours: number | null;
  sss_ss: number | null;
  sss_ec: number | null;
}

export interface JoPayrollGroup<M extends JoPayrollMemberLike> {
  rate: number;
  members: M[];
  totalGross: number;
  totalSss: number;
  totalNet: number;
}

export function groupMembersByRate<M extends JoPayrollMemberLike>(
  members: M[],
): JoPayrollGroup<M>[] {
  const byRate = new Map<number, M[]>();
  for (const m of members) {
    const r = n(m.rate);
    if (!byRate.has(r)) byRate.set(r, []);
    byRate.get(r)!.push(m);
  }
  return Array.from(byRate.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, ms]) => {
      const totalGross = ms.reduce(
        (s, m) => s + computeJoGross(m.rate, m.days),
        0,
      );
      const totalSss = ms.reduce(
        (s, m) => s + computeJoSssDeduction(m.sss_ss, m.sss_ec),
        0,
      );
      return {
        rate,
        members: ms,
        totalGross,
        totalSss,
        totalNet: totalGross - totalSss,
      };
    });
}

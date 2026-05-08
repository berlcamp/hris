const DEFAULT_PERA_MONTHLY = 2000;

export function getPeraMonthlyAmountFromEnv(): number {
  const raw = process.env.NEXT_PUBLIC_PERA_MONTHLY_AMOUNT;
  if (raw === undefined || raw === "") return DEFAULT_PERA_MONTHLY;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_PERA_MONTHLY;
  return n;
}

export function computeNetPeraAmount(
  economicEnterpriseMultipurposeCoopPera: number | null | undefined,
  courage2PeraLoan: number | null | undefined,
  baseAmount: number = getPeraMonthlyAmountFromEnv(),
): number {
  const d1 = economicEnterpriseMultipurposeCoopPera ?? 0;
  const d2 = courage2PeraLoan ?? 0;
  return baseAmount - d1 - d2;
}

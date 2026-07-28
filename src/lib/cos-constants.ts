// Contract of Service shared constants.
// Value lists mirror the CHECK constraints in
// supabase/migrations/058_cos_module_foundation.sql — keep them in sync.

export const COS_EMPLOYEE_STATUSES = ["active", "inactive"] as const;
export type CosEmployeeStatus = (typeof COS_EMPLOYEE_STATUSES)[number];

export const COS_EMPLOYEE_STATUS_LABELS: Record<CosEmployeeStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const COS_EMPLOYEE_STATUS_VARIANT: Record<
  CosEmployeeStatus,
  "default" | "secondary"
> = {
  active: "default",
  inactive: "secondary",
};

export const COS_SEXES = ["male", "female"] as const;
export type CosSex = (typeof COS_SEXES)[number];

export const COS_SEX_LABELS: Record<CosSex, string> = {
  male: "Male",
  female: "Female",
};

export interface CosEmployeeNameParts {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
}

/**
 * "Dela Cruz, Juan Santos Jr." — surname first, for list sorting and print.
 * Absent middle name and suffix collapse without leaving double spaces.
 */
export function formatCosEmployeeName(e: CosEmployeeNameParts): string {
  const given = [e.first_name, e.middle_name, e.suffix]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(" ");
  return given ? `${e.last_name.trim()}, ${given}` : e.last_name.trim();
}

// ── Contracts (COS-3) ────────────────────────────────────────────────────
// Mirrors the CHECK constraint in
// supabase/migrations/063_cos_contracts_module.sql — keep in sync.
export const COS_CONTRACT_STATUSES = ["active", "terminated"] as const;
export type CosContractStatus = (typeof COS_CONTRACT_STATUSES)[number];

/**
 * What the UI shows. "expired" is NOT a stored status — a stored one would
 * need a cron to stay truthful and would drift the moment that job failed.
 */
export type CosContractDerivedStatus = "active" | "expired" | "terminated";

export const COS_CONTRACT_STATUS_LABELS: Record<
  CosContractDerivedStatus,
  string
> = {
  active: "Active",
  expired: "Expired",
  terminated: "Terminated",
};

export const COS_CONTRACT_STATUS_VARIANT: Record<
  CosContractDerivedStatus,
  "default" | "secondary" | "destructive"
> = {
  active: "default",
  expired: "secondary",
  terminated: "destructive",
};

/**
 * Local-calendar YYYY-MM-DD. Deliberately NOT toISOString(), which converts to
 * UTC and rolls the date over for evening times in Asia/Manila — the bug class
 * migration 035 exists to fix.
 */
export function toIsoDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The single source of truth for a contract's displayed state. List, detail
 * and timeline all call this so they cannot disagree.
 *
 * Dates are compared as YYYY-MM-DD strings, which sort lexicographically in
 * calendar order — no Date arithmetic, no timezone exposure.
 */
export function deriveCosContractStatus(
  contract: { status: CosContractStatus; period_end: string },
  today: string = toIsoDateString(new Date()),
): CosContractDerivedStatus {
  if (contract.status === "terminated") return "terminated";
  return contract.period_end < today ? "expired" : "active";
}

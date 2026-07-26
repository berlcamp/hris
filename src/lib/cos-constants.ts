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

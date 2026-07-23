export const APP_NAME = "LGU HRIS";
export const APP_DESCRIPTION =
  "Human Resource Information System for Local Government Units";

export const USER_ROLES = {
  SUPER_ADMIN: "super_admin",
  OCM_ADMIN: "ocm_admin",
  HR_ADMIN: "hr_admin",
  HR_RECORD_MANAGER: "hr_record_manager",
  DEPARTMENT_HEAD: "department_head",
  EMPLOYEE: "employee",
} as const;

export const EMPLOYMENT_TYPES = {
  PLANTILLA: "plantilla",
  JO: "jo",
  COS: "cos",
} as const;

export const EMPLOYEE_STATUSES = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  RETIRED: "retired",
  TERMINATED: "terminated",
  RESIGNED: "resigned",
  SUSPENDED: "suspended",
  AWOL: "awol",
  DROPPED: "dropped",
  DECEASED: "deceased",
} as const;

/** Display labels (CSC-aligned wording) for the employee_status enum. */
export const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  retired: "Retired",
  terminated: "Terminated",
  resigned: "Resigned",
  suspended: "Suspended",
  awol: "AWOL",
  dropped: "Dropped From the Rolls",
  deceased: "Deceased",
};

/** Short description shown beside each status in the change-status dialog. */
export const EMPLOYEE_STATUS_DESCRIPTIONS: Record<string, string> = {
  active: "Currently employed and reporting for duty.",
  inactive: "On extended leave or temporarily not in service.",
  retired: "Compulsory (65) or optional (60) retirement under CSC/GSIS rules.",
  terminated: "Dismissed from service after due process (CSC penalty).",
  resigned: "Voluntary separation accepted by appointing authority.",
  suspended: "Preventive or punitive suspension under CSC Rule X.",
  awol: "Absent Without Official Leave — pending Dropped From the Rolls.",
  dropped: "Dropped From the Rolls (CSC MC 14, s. 2018) — AWOL > 30 days.",
  deceased: "Separated from service due to death.",
};

/**
 * Only employees with `active` status participate in HR automation
 * (leave-credit accrual, payroll runs, dashboard headcounts). Everything
 * else here is excluded.
 */
export const NON_ACTIVE_EMPLOYEE_STATUSES = [
  "inactive",
  "retired",
  "terminated",
  "resigned",
  "suspended",
  "awol",
  "dropped",
  "deceased",
] as const;

export const APPROVAL_STATUSES = {
  DRAFT: "draft",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

export const LEAVE_TYPE_CODES = [
  "VL",
  "SL",
  "ML",
  "PL",
  "SPL",
  "FL",
  "SoloParent",
  "VAWC",
  "RA9262",
  "CL",
  "AL",
  "RL",
  "SEL",
] as const;

export const DOCUMENT_TYPES = {
  "201_FILE": "201_file",
  NOSI: "nosi",
  NOSA: "nosa",
  SERVICE_RECORD: "service_record",
  LEAVE_FORM: "leave_form",
  DTR: "dtr",
  IPCR: "ipcr",
  OTHER: "other",
} as const;

export const SALARY_CHANGE_REASONS = {
  INITIAL: "initial",
  STEP_INCREMENT: "step_increment",
  PROMOTION: "promotion",
  RECLASSIFICATION: "reclassification",
  SALARY_STANDARDIZATION: "salary_standardization",
  ADJUSTMENT: "adjustment",
  DEMOTION: "demotion",
} as const;

/** Resets the NOSI "years in step" clock — use the latest effective_date across these. */
export const NOSI_BASIS_SALARY_REASONS = [
  "step_increment",
  "promotion",
  "reclassification",
  "initial",
  "demotion",
] as const;

// Reasons a manual attendance entry has no time punches but is not an absence
// (employee out on official duty, or the slot fell on a declared holiday). The
// label is what prints on the DTR row.
export const NO_TIME_REASONS = [
  "travel",
  "field_work",
  "official_business",
  "holiday",
  "off",
] as const;

export type NoTimeReason = (typeof NO_TIME_REASONS)[number];

export const NO_TIME_REASON_LABELS: Record<NoTimeReason, string> = {
  travel: "TRAVEL",
  field_work: "FIELD WORK",
  official_business: "OFFICIAL BUSINESS",
  holiday: "HOLIDAY",
  off: "OFF",
};

// Short labels printed inside a single DTR time cell.
export const NO_TIME_REASON_SHORT: Record<NoTimeReason, string> = {
  travel: "TRAVEL",
  field_work: "FW",
  official_business: "OB",
  holiday: "HOLIDAY",
  off: "OFF",
};

export const EMPLOYEE_NO_PREFIX = "LGU";

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100];

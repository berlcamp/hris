export const APP_NAME = "LGU HRIS";
export const APP_DESCRIPTION =
  "Human Resource Information System for Local Government Units";

export const USER_ROLES = {
  SUPER_ADMIN: "super_admin",
  HR_ADMIN: "hr_admin",
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
} as const;

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

export const EMPLOYEE_NO_PREFIX = "LGU";

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100];

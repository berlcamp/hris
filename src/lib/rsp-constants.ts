// RSP (Recruitment, Selection, Placement) shared constants.
// Status/nature value lists mirror the CHECK constraints and enums in
// supabase/migrations/050_rsp_module.sql — keep them in sync.

export const VACANCY_STATUSES = [
  "draft",
  "published",
  "closed",
  "filled",
  "cancelled",
] as const;
export type RspVacancyStatus = (typeof VACANCY_STATUSES)[number];

export const APPLICATION_STATUSES = [
  "pending",
  "qualified",
  "disqualified",
  "withdrawn",
  "selected",
] as const;
export type RspApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPOINTMENT_STATUSES = [
  "issued",
  "disapproved",
  "recalled",
  "cancelled",
] as const;
export type RspAppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

// CS Form 33-B fixed lists (Postgres enums in the DB)
export const APPOINTMENT_NATURES = [
  "original",
  "promotion",
  "transfer",
  "reemployment",
  "reappointment",
  "reclassification",
  "demotion",
  "others",
] as const;
export type RspAppointmentNature = (typeof APPOINTMENT_NATURES)[number];

export const APPOINTMENT_STATUS_TYPES = [
  "permanent",
  "temporary",
  "coterminous",
  "casual",
  "contractual",
  "substitute",
  "provisional",
] as const;
export type RspAppointmentStatusType = (typeof APPOINTMENT_STATUS_TYPES)[number];

export const VACANCY_STATUS_LABELS: Record<RspVacancyStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  filled: "Filled",
  cancelled: "Cancelled",
};

export const APPLICATION_STATUS_LABELS: Record<RspApplicationStatus, string> = {
  pending: "Pending Screening",
  qualified: "Qualified",
  disqualified: "Disqualified",
  withdrawn: "Withdrawn",
  selected: "Selected",
};

export const APPOINTMENT_STATUS_LABELS: Record<RspAppointmentStatus, string> = {
  issued: "Issued",
  disapproved: "Disapproved",
  recalled: "Recalled",
  cancelled: "Cancelled",
};

export const APPOINTMENT_NATURE_LABELS: Record<RspAppointmentNature, string> = {
  original: "Original",
  promotion: "Promotion",
  transfer: "Transfer",
  reemployment: "Reemployment",
  reappointment: "Reappointment",
  reclassification: "Reclassification",
  demotion: "Demotion",
  others: "Others",
};

export const APPOINTMENT_STATUS_TYPE_LABELS: Record<
  RspAppointmentStatusType,
  string
> = {
  permanent: "Permanent",
  temporary: "Temporary",
  coterminous: "Coterminous",
  casual: "Casual",
  contractual: "Contractual",
  substitute: "Substitute",
  provisional: "Provisional",
};

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export const VACANCY_STATUS_VARIANT: Record<RspVacancyStatus, BadgeVariant> = {
  draft: "outline",
  published: "default",
  closed: "secondary",
  filled: "default",
  cancelled: "destructive",
};

export const APPLICATION_STATUS_VARIANT: Record<
  RspApplicationStatus,
  BadgeVariant
> = {
  pending: "outline",
  qualified: "default",
  disqualified: "destructive",
  withdrawn: "secondary",
  selected: "default",
};

export const APPOINTMENT_STATUS_VARIANT: Record<
  RspAppointmentStatus,
  BadgeVariant
> = {
  issued: "default",
  disapproved: "destructive",
  recalled: "destructive",
  cancelled: "destructive",
};

/**
 * Default HRMPSB comparative assessment criteria seeded per vacancy at
 * creation (fully editable afterward). Mix mirrors what ORAOHRA Rule IV
 * requires LGU Merit Selection Plans to cover: education, experience,
 * training, written examination, interview/BEI, and potential.
 * Weights sum to 100; weighted total = Σ(score / max_score × weight).
 */
export const DEFAULT_ASSESSMENT_CRITERIA = [
  { name: "Education", weight: 10, max_score: 100, sort_order: 1 },
  { name: "Experience", weight: 10, max_score: 100, sort_order: 2 },
  { name: "Training", weight: 10, max_score: 100, sort_order: 3 },
  { name: "Written Examination", weight: 30, max_score: 100, sort_order: 4 },
  { name: "Interview", weight: 30, max_score: 100, sort_order: 5 },
  { name: "Potential / Aptitude", weight: 10, max_score: 100, sort_order: 6 },
] as const;

/** RA 7041: posting period of at least 10 calendar days, counted inclusively. */
export const MIN_POSTING_DAYS = 10;

/** ORAOHRA: a publication is valid for 9 months from publication date. */
export const PUBLICATION_VALIDITY_MONTHS = 9;

/**
 * Derived (never stored): a published/closed vacancy whose 9-month
 * publication validity has lapsed without being filled.
 */
export function isVacancyExpired(vacancy: {
  status: string;
  publication_expiry_date: string | null;
}): boolean {
  if (!vacancy.publication_expiry_date) return false;
  if (!["published", "closed"].includes(vacancy.status)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today > vacancy.publication_expiry_date;
}

/** Applicant/employee display name: "Last, First M. Ext" */
export function formatApplicantName(a: {
  last_name: string;
  first_name: string;
  middle_name?: string | null;
  name_extension?: string | null;
}): string {
  const mi = a.middle_name?.trim() ? ` ${a.middle_name.trim().charAt(0)}.` : "";
  const ext = a.name_extension?.trim() ? ` ${a.name_extension.trim()}` : "";
  return `${a.last_name}, ${a.first_name}${mi}${ext}`;
}

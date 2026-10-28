/**
 * The people who sign the Job Order printables, as stored in
 * hris.job_order_signatories (migration 096) and edited from
 * Job Orders → Signatories.
 *
 * Plain module with no `@/` imports, so the print generators that the Node
 * render tests load by relative path can import the defaults from here.
 */

export type JobOrderSignatoryKey =
  | "city_mayor"
  | "city_administrator"
  | "payroll_accountant"
  | "payroll_certifier"
  | "payroll_approver"
  | "payroll_treasurer"
  | "obr_budget_officer"
  | "sss_prepared_by"
  | "sss_noted_by";

export interface JobOrderSignatory {
  name: string;
  position: string;
  /** Printed only where the form has an office line; null prints nothing. */
  office: string | null;
}

export type JobOrderSignatories = Record<JobOrderSignatoryKey, JobOrderSignatory>;

export interface JobOrderSignatorySlot {
  key: JobOrderSignatoryKey;
  /** The role as the settings page shows it. */
  label: string;
  /** Which printables carry this signatory, and where. */
  usedOn: string;
  /** Whether the form prints an office line for this slot. */
  hasOffice: boolean;
}

/** One group per printable family, in the order the settings page shows them. */
export const JOB_ORDER_SIGNATORY_GROUPS: {
  title: string;
  description: string;
  slots: JobOrderSignatorySlot[];
}[] = [
  {
    title: "Memorandum & Special Order",
    description: "Office of the City Mayor documents issued to Job Order personnel.",
    slots: [
      {
        key: "city_mayor",
        label: "City Mayor",
        usedOn:
          "Signs the Memorandum and Special Order (its position also fills the FROM line) and the OBR's Requested by.",
        hasOffice: false,
      },
      {
        key: "city_administrator",
        label: "Addressee",
        usedOn:
          "The TO line of every Special Order and of a new-contract Memorandum.",
        hasOffice: true,
      },
    ],
  },
  {
    title: "Daily Wages Payroll",
    description: "The payroll form printed from a Job Order payroll.",
    slots: [
      {
        key: "payroll_accountant",
        label: "Accountant",
        usedOn: "Top right of the form's header.",
        hasOffice: false,
      },
      {
        key: "payroll_certifier",
        label: "Foreman / Supervisor",
        usedOn: "CERTIFY: services rendered for the time stated.",
        hasOffice: false,
      },
      {
        key: "payroll_approver",
        label: "Approving Officer",
        usedOn: "Approved for Payment.",
        hasOffice: false,
      },
      {
        key: "payroll_treasurer",
        label: "Treasurer",
        usedOn: "CERTIFIED: Funds available.",
        hasOffice: false,
      },
    ],
  },
  {
    title: "Obligation Request (OBR)",
    description: "The Job Order payroll's OBR. Requested by is the City Mayor above.",
    slots: [
      {
        key: "obr_budget_officer",
        label: "Budget Officer",
        usedOn: "Certified: existence of available appropriation.",
        hasOffice: false,
      },
    ],
  },
  {
    title: "SSS Contribution List",
    description: "The monthly list printed from the Job Order payroll list.",
    slots: [
      {
        key: "sss_prepared_by",
        label: "Prepared By",
        usedOn: "Left of the footer.",
        hasOffice: false,
      },
      {
        key: "sss_noted_by",
        label: "Noted By",
        usedOn: "Right of the footer.",
        hasOffice: false,
      },
    ],
  },
];

export const JOB_ORDER_SIGNATORY_KEYS: JobOrderSignatoryKey[] =
  JOB_ORDER_SIGNATORY_GROUPS.flatMap((g) => g.slots.map((s) => s.key));

/**
 * What the forms printed before the signatories were editable, and what they
 * still print for any key with no row. Mirrors the seed in migration 096.
 */
export const DEFAULT_JOB_ORDER_SIGNATORIES: JobOrderSignatories = {
  city_mayor: { name: "SAM NORMAN G. FUENTES", position: "City Mayor", office: null },
  city_administrator: {
    name: "MS. RUTHEZA GRACE A. OUANO",
    position: "City Administrator",
    office: "City Administrator's Office",
  },
  payroll_accountant: {
    name: "EASY XAFLAVAIRE HOPE E. DIMAL",
    position: "CITY ACCOUNTANT",
    office: null,
  },
  payroll_certifier: { name: "CAROLYN N. GO", position: "Executive Assistant IV", office: null },
  payroll_approver: { name: "RUTHEZA GRACE A. OUANO", position: "City Admistrator", office: null },
  payroll_treasurer: { name: "JULIE FE C. NAPIGKIT", position: "City Treasurer", office: null },
  obr_budget_officer: { name: "EVELYN T. OMILDA", position: "Budget Officer", office: null },
  sss_prepared_by: { name: "MARICELL P. SALVADOR", position: "Day Care Worker I", office: null },
  sss_noted_by: { name: "RUTHEZA GRACE A. OUANO", position: "City Administrator", office: null },
};

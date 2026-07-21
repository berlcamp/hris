// Database types — these will be replaced with auto-generated types from Supabase
// Run: supabase gen types typescript --schema hris > src/lib/database.types.ts

import type {
  RspVacancyStatus,
  RspApplicationStatus,
  RspAppointmentStatus,
  RspAppointmentNature,
  RspAppointmentStatusType,
} from "@/lib/rsp-constants";

export type UserRole =
  | "super_admin"
  | "ocm_admin"
  | "hr_admin"
  | "hr_record_manager"
  | "department_head"
  | "department_admin"
  | "department_admin_and_department_head"
  | "dtr_manager"
  | "employee";
export type EmploymentType = "plantilla" | "jo" | "cos";
export type EmployeeStatus =
  | "active"
  | "inactive"
  | "retired"
  | "terminated"
  | "resigned"
  | "suspended"
  | "awol"
  | "dropped"
  | "deceased";
export type ApprovalStatus = "draft" | "pending" | "approved" | "rejected" | "cancelled";
export type LeaveTypeCode =
  | "VL" | "SL" | "ML" | "PL" | "SPL" | "FL"
  | "SoloParent" | "VAWC" | "RA9262" | "CL" | "AL" | "RL" | "SEL";
export type DocumentType =
  | "201_file" | "nosi" | "nosa" | "service_record"
  | "leave_form" | "dtr" | "ipcr" | "other";
export type SalaryChangeReason =
  | "initial" | "step_increment" | "promotion" | "reclassification"
  | "salary_standardization" | "adjustment" | "demotion";

export interface Department {
  id: string;
  name: string;
  code: string;
  head_employee_id: string | null;
  head_custom_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department_id: string | null;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  title: string;
  item_number: string | null;
  salary_grade: number;
  department_id: string | null;
  is_filled: boolean;
  created_at: string;
}

export interface Employee {
  id: string;
  user_profile_id: string | null;
  id_number: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  birth_date: string | null;
  gender: string | null;
  civil_status: string | null;
  address: string | null;
  phone: string | null;
  employment_type: EmploymentType;
  position_id: string | null;
  department_id: string | null;
  detailed_department_id: string | null;
  is_department_head: boolean;
  salary_grade: number;
  step_increment: number;
  hire_date: string;
  end_of_contract: string | null;
  status: EmployeeStatus;
  status_effective_date: string | null;
  status_remarks: string | null;
  vl_sl_needs_manual_entry: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalaryGradeTable {
  id: string;
  grade: number;
  step: number;
  amount: number;
  tranche: number;
  effective_year: number;
}

export interface SalaryHistory {
  id: string;
  employee_id: string;
  salary_grade: number;
  step: number;
  salary_amount: number;
  effective_date: string;
  reason: SalaryChangeReason;
  reference_id: string | null;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
}

export interface NosiRecord {
  id: string;
  employee_id: string;
  current_salary_grade: number;
  current_step: number;
  new_step: number;
  current_salary: number;
  new_salary: number;
  effective_date: string;
  last_increment_date: string | null;
  years_in_step: number | null;
  status: ApprovalStatus;
  generated_by: string | null;
  reviewed_by: string | null;
  approved_by: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface NosaRecord {
  id: string;
  employee_id: string;
  previous_salary_grade: number;
  previous_step: number;
  previous_salary: number;
  new_salary_grade: number;
  new_step: number;
  new_salary: number;
  reason: SalaryChangeReason;
  effective_date: string;
  status: ApprovalStatus;
  generated_by: string | null;
  reviewed_by: string | null;
  approved_by: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  legal_basis: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveType {
  id: string;
  code: LeaveTypeCode;
  name: string;
  max_credits: number | null;
  is_cumulative: boolean;
  is_convertible: boolean;
  applicable_to: string;
  created_at: string;
}

export interface LeaveCredit {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  total_credits: number;
  used_credits: number;
  balance: number;
}

export interface LeaveApplication {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_applied: number;
  reason: string | null;
  status: ApprovalStatus;
  department_head_id: string | null;
  hr_reviewer_id: string | null;
  dept_approved_at: string | null;
  hr_approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type CtoDayType = "regular" | "rest_day" | "holiday";

export interface CtoCredit {
  id: string;
  employee_id: string;
  ot_date: string;
  day_type: CtoDayType;
  hours_worked: number;
  multiplier: number;
  hours_earned: number;
  expiry_date: string;
  office_order_no: string | null;
  notes: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CtoApplication {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  cto_dates: string[];
  hours_applied: number;
  reason: string | null;
  status: ApprovalStatus;
  department_head_id: string | null;
  hr_reviewer_id: string | null;
  dept_approved_at: string | null;
  hr_approved_at: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceLog {
  id: string;
  employee_id: string;
  date: string;
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  is_late: boolean;
  late_minutes: number;
  is_undertime: boolean;
  undertime_minutes: number;
  is_absent: boolean;
  remarks: string | null;
  source: string;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
  updated_at: string | null;
  updated_by: string | null;
  updated_by_email: string | null;
}

export interface DtrSummary {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  total_days_present: number;
  total_days_absent: number;
  total_late_minutes: number;
  total_undertime_minutes: number;
  generated_at: string;
}

export interface IpcrPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export interface IpcrRecord {
  id: string;
  employee_id: string;
  period_id: string;
  numerical_rating: number | null;
  adjectival_rating: string | null;
  status: ApprovalStatus;
  reviewed_by: string | null;
  approved_by: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  employee_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  type: DocumentType;
  reference_id: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface ServiceRecord {
  id: string;
  employee_id: string;
  date_from: string;
  date_to: string | null;
  designation: string;
  status_type: string | null;
  salary: number | null;
  office: string | null;
  branch: string | null;
  leave_without_pay: number;
  separation_date: string | null;
  separation_cause: string | null;
  remarks: string | null;
  salary_grade: number | null;
  step_increment: number | null;
  agency: string | null;
  daily_salary: number | null;
  created_by: string | null;
  legacy_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceRecordActivityLogEntry {
  id: string;
  service_record_id: string;
  user_id: string | null;
  action: "created" | "updated" | "deleted";
  description: string | null;
  created_at: string;
  user_profiles: { full_name: string; email: string } | null;
}

// ============================================================================
// Payroll
// ============================================================================

export interface Payroll {
  id: string;
  period_start: string;
  period_end: string;
  particulars: string | null;
  particulars_2nd_half: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeePayroll {
  id: string;
  payroll_id: string;
  employee_id: string;
  designation: string | null;
  monthly_rate: number | null;
  sif: number | null;
  withholding_tax: number | null;
  philhealth_personal_share: number | null;
  philhealth_govt_share: number | null;
  gsis_personal_share: number | null;
  gsis_govt_share: number | null;
  pag_ibig_personal_share: number | null;
  pag_ibig_govt_share: number | null;
  hmdf: number | null;
  pag_ibig_salary_loan: number | null;
  ss_contribution: number | null;
  ss_contribution_ec: number | null;
  gsis_repayments_mpl: number | null;
  gsis_repayments_mpl_lite: number | null;
  gsis_repayments_policy_loan: number | null;
  gsis_repayments_cpl: number | null;
  courage_2_contribution: number | null;
  courage_salary_loan: number | null;
  economic_enterprise_multipurpose_coop: number | null;
  eempc_salary_loan: number | null;
  emergency_loan: number | null;
  notice_of_disallowance: number | null;
  economic_enterprise_multipurpose_coop_pera: number | null;
  courage_2_pera_loan: number | null;
  amount_received: number | null;
  amount_received_2nd_half: number | null;
  lbp_savings_account_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface CosPayroll {
  id: string;
  period_start: string;
  period_end: string;
  particulars: string | null;
  created_at: string;
  updated_at: string;
}

export interface CosEmployeePayroll {
  id: string;
  payroll_id: string;
  employee_id: string;
  designation: string | null;
  monthly_rate: number | null;
  absent_without_pay: number | null;
  ss_contribution: number | null;
  ss_contribution_ec: number | null;
  percentage_tax_3: number | null;
  amount_received: number | null;
  created_at: string;
  updated_at: string;
}

export interface JoPayroll {
  id: string;
  period_start: string;
  period_end: string;
  description: string | null;
  particulars: string | null;
  areas: string | null;
  days: number | null;
  payroll_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface JoPayrollMember {
  id: string;
  payroll_id: string;
  employee_id: string;
  days: number | null;
  hours: number | null;
  rate: number | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// RSP (Recruitment, Selection, Placement)
// Status/nature unions live in src/lib/rsp-constants.ts
// ============================================================

export type {
  RspVacancyStatus,
  RspApplicationStatus,
  RspAppointmentStatus,
  RspAppointmentNature,
  RspAppointmentStatusType,
};

export interface RspVacancy {
  id: string;
  plantilla_id: string;
  item_number: string;
  position_title: string;
  organizational_unit: string | null;
  place_of_assignment: string | null;
  salary_grade: number | null;
  monthly_salary: number | null;
  qs_education: string | null;
  qs_training: string | null;
  qs_training_hours: number | null;
  qs_experience: string | null;
  qs_experience_years: number | null;
  qs_eligibility: string | null;
  publication_date: string | null;
  closing_date: string | null;
  csc_bulletin_no: string | null;
  publication_expiry_date: string | null;
  hrmpsb_deliberation_date: string | null;
  status: RspVacancyStatus;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RspApplicant {
  id: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  name_extension: string | null;
  sex: "male" | "female" | null;
  birth_date: string | null;
  address: string | null;
  email: string | null;
  mobile_no: string | null;
  employee_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RspApplication {
  id: string;
  vacancy_id: string;
  applicant_id: string;
  date_received: string;
  education: string | null;
  training: string | null;
  training_hours: number | null;
  experience: string | null;
  experience_years: number | null;
  eligibility: string | null;
  status: RspApplicationStatus;
  screened_by: string | null;
  screened_at: string | null;
  screening_remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface RspAssessmentCriterion {
  id: string;
  vacancy_id: string;
  name: string;
  weight: number;
  max_score: number;
  sort_order: number;
}

export interface RspAssessmentScore {
  id: string;
  application_id: string;
  criterion_id: string;
  score: number;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface RspAppointment {
  id: string;
  vacancy_id: string;
  application_id: string;
  plantilla_id: string;
  nature: RspAppointmentNature;
  nature_others: string | null;
  status_type: RspAppointmentStatusType;
  item_number: string | null;
  vice: string | null;
  date_of_signing: string;
  oath_date: string | null;
  assumption_date: string | null;
  probation_end_date: string | null;
  employment_period_from: string | null;
  employment_period_to: string | null;
  appointing_authority: string | null;
  appointing_authority_position: string | null;
  status: RspAppointmentStatus;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

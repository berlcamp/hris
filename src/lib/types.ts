// Database types — these will be replaced with auto-generated types from Supabase
// Run: supabase gen types typescript --schema hris > src/lib/database.types.ts

export type UserRole = "super_admin" | "hr_admin" | "department_head" | "employee";
export type EmploymentType = "plantilla" | "jo" | "cos";
export type EmployeeStatus = "active" | "inactive" | "retired" | "terminated" | "resigned";
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
  employee_no: string;
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
  salary_grade: number;
  step_increment: number;
  hire_date: string;
  end_of_contract: string | null;
  status: EmployeeStatus;
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
  created_at: string;
}

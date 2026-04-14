-- Migration 007: Row Level Security Policies
SET search_path TO hris, public, auth, extensions;

-- Enable RLS on all tables in hris schema
ALTER TABLE hris.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.salary_grade_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.salary_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.nosi_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.nosa_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.leave_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.dtr_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.ipcr_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.ipcr_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.service_records ENABLE ROW LEVEL SECURITY;

-- Grant table-level access to roles (required for RLS on custom schemas)
GRANT ALL ON ALL TABLES IN SCHEMA hris TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA hris TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA hris TO service_role;

-- ============================================================
-- Helper functions
-- ============================================================

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION hris.get_user_role()
RETURNS hris.user_role AS $$
  SELECT role FROM hris.user_profiles
  WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get current user's department
CREATE OR REPLACE FUNCTION hris.get_user_department_id()
RETURNS UUID AS $$
  SELECT department_id FROM hris.user_profiles
  WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get current user's employee_id
CREATE OR REPLACE FUNCTION hris.get_employee_id()
RETURNS UUID AS $$
  SELECT e.id FROM hris.employees e
  JOIN hris.user_profiles up ON e.user_profile_id = up.id
  WHERE up.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- user_profiles policies
-- ============================================================
CREATE POLICY "super_admin_full_access" ON hris.user_profiles
  FOR ALL USING (hris.get_user_role() = 'super_admin');

CREATE POLICY "hr_admin_full_read" ON hris.user_profiles
  FOR SELECT USING (hris.get_user_role() = 'hr_admin');

CREATE POLICY "dept_head_own_dept" ON hris.user_profiles
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND department_id = hris.get_user_department_id()
  );

CREATE POLICY "employee_self" ON hris.user_profiles
  FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- ============================================================
-- employees policies
-- ============================================================
CREATE POLICY "admin_all_employees" ON hris.employees
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_employees" ON hris.employees
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND department_id = hris.get_user_department_id()
  );

CREATE POLICY "employee_self_record" ON hris.employees
  FOR SELECT USING (id = hris.get_employee_id());

-- ============================================================
-- Reference tables (readable by all authenticated)
-- ============================================================
CREATE POLICY "all_read_departments" ON hris.departments
  FOR SELECT USING (true);

CREATE POLICY "admin_manage_departments" ON hris.departments
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "all_read_positions" ON hris.positions
  FOR SELECT USING (true);

CREATE POLICY "admin_manage_positions" ON hris.positions
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "all_read_salary_grades" ON hris.salary_grade_table
  FOR SELECT USING (true);

CREATE POLICY "admin_manage_salary_grades" ON hris.salary_grade_table
  FOR ALL USING (hris.get_user_role() = 'super_admin');

CREATE POLICY "all_read_leave_types" ON hris.leave_types
  FOR SELECT USING (true);

CREATE POLICY "admin_manage_leave_types" ON hris.leave_types
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "all_read_ipcr_periods" ON hris.ipcr_periods
  FOR SELECT USING (true);

CREATE POLICY "admin_manage_ipcr_periods" ON hris.ipcr_periods
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

-- ============================================================
-- salary_history policies
-- ============================================================
CREATE POLICY "admin_all_salary_history" ON hris.salary_history
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_salary_history" ON hris.salary_history
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_own_salary_history" ON hris.salary_history
  FOR SELECT USING (employee_id = hris.get_employee_id());

-- ============================================================
-- nosi_records policies
-- ============================================================
CREATE POLICY "admin_all_nosi" ON hris.nosi_records
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_nosi" ON hris.nosi_records
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_own_nosi" ON hris.nosi_records
  FOR SELECT USING (employee_id = hris.get_employee_id());

-- ============================================================
-- nosa_records policies
-- ============================================================
CREATE POLICY "admin_all_nosa" ON hris.nosa_records
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_nosa" ON hris.nosa_records
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_own_nosa" ON hris.nosa_records
  FOR SELECT USING (employee_id = hris.get_employee_id());

-- ============================================================
-- leave_applications policies
-- ============================================================
CREATE POLICY "hr_all_leave" ON hris.leave_applications
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_leave" ON hris.leave_applications
  FOR ALL USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_create_leave" ON hris.leave_applications
  FOR INSERT WITH CHECK (employee_id = hris.get_employee_id());

CREATE POLICY "employee_view_own_leave" ON hris.leave_applications
  FOR SELECT USING (employee_id = hris.get_employee_id());

-- ============================================================
-- leave_credits policies
-- ============================================================
CREATE POLICY "admin_all_leave_credits" ON hris.leave_credits
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_leave_credits" ON hris.leave_credits
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_own_leave_credits" ON hris.leave_credits
  FOR SELECT USING (employee_id = hris.get_employee_id());

-- ============================================================
-- attendance_logs policies
-- ============================================================
CREATE POLICY "admin_all_attendance" ON hris.attendance_logs
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_attendance" ON hris.attendance_logs
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_own_attendance" ON hris.attendance_logs
  FOR SELECT USING (employee_id = hris.get_employee_id());

-- ============================================================
-- dtr_summary policies
-- ============================================================
CREATE POLICY "admin_all_dtr" ON hris.dtr_summary
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_dtr" ON hris.dtr_summary
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_own_dtr" ON hris.dtr_summary
  FOR SELECT USING (employee_id = hris.get_employee_id());

-- ============================================================
-- ipcr_records policies
-- ============================================================
CREATE POLICY "admin_all_ipcr" ON hris.ipcr_records
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_ipcr" ON hris.ipcr_records
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_own_ipcr" ON hris.ipcr_records
  FOR SELECT USING (employee_id = hris.get_employee_id());

-- ============================================================
-- documents policies
-- ============================================================
CREATE POLICY "admin_all_documents" ON hris.documents
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_documents" ON hris.documents
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_own_documents" ON hris.documents
  FOR SELECT USING (employee_id = hris.get_employee_id());

-- ============================================================
-- service_records policies
-- ============================================================
CREATE POLICY "admin_all_service_records" ON hris.service_records
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_service_records" ON hris.service_records
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_own_service_records" ON hris.service_records
  FOR SELECT USING (employee_id = hris.get_employee_id());

-- ============================================================
-- audit_log policies (admin read-only, system insert)
-- ============================================================
CREATE POLICY "admin_audit_log" ON hris.audit_log
  FOR SELECT USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "system_insert_audit" ON hris.audit_log
  FOR INSERT WITH CHECK (true);  -- Allow inserts from triggers/functions

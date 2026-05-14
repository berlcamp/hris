-- Migration 029: Extend RLS policies to recognize the composite
-- "department_admin_and_department_head" role wherever the existing policies
-- check for 'department_head'. The composite role inherits dept_head's
-- department-scoped access.
--
-- Note: most server actions use the admin client (which bypasses RLS) and
-- re-implement role-based filtering in TypeScript; this migration keeps the
-- defense-in-depth layer aligned with the new role.
SET search_path TO hris, public, auth, extensions;

-- user_profiles
DROP POLICY IF EXISTS "dept_head_own_dept" ON hris.user_profiles;
CREATE POLICY "dept_head_own_dept" ON hris.user_profiles
  FOR SELECT USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND department_id = hris.get_user_department_id()
  );

-- employees
DROP POLICY IF EXISTS "dept_head_dept_employees" ON hris.employees;
CREATE POLICY "dept_head_dept_employees" ON hris.employees
  FOR SELECT USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND department_id = hris.get_user_department_id()
  );

-- salary_history
DROP POLICY IF EXISTS "dept_head_dept_salary_history" ON hris.salary_history;
CREATE POLICY "dept_head_dept_salary_history" ON hris.salary_history
  FOR SELECT USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

-- nosi_records
DROP POLICY IF EXISTS "dept_head_dept_nosi" ON hris.nosi_records;
CREATE POLICY "dept_head_dept_nosi" ON hris.nosi_records
  FOR SELECT USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

-- nosa_records
DROP POLICY IF EXISTS "dept_head_dept_nosa" ON hris.nosa_records;
CREATE POLICY "dept_head_dept_nosa" ON hris.nosa_records
  FOR SELECT USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

-- leave_applications
DROP POLICY IF EXISTS "dept_head_dept_leave" ON hris.leave_applications;
CREATE POLICY "dept_head_dept_leave" ON hris.leave_applications
  FOR ALL USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

-- leave_credits
DROP POLICY IF EXISTS "dept_head_dept_leave_credits" ON hris.leave_credits;
CREATE POLICY "dept_head_dept_leave_credits" ON hris.leave_credits
  FOR SELECT USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

-- attendance_logs
DROP POLICY IF EXISTS "dept_head_dept_attendance" ON hris.attendance_logs;
CREATE POLICY "dept_head_dept_attendance" ON hris.attendance_logs
  FOR SELECT USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

-- dtr_summary
DROP POLICY IF EXISTS "dept_head_dept_dtr" ON hris.dtr_summary;
CREATE POLICY "dept_head_dept_dtr" ON hris.dtr_summary
  FOR SELECT USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

-- ipcr_records
DROP POLICY IF EXISTS "dept_head_dept_ipcr" ON hris.ipcr_records;
CREATE POLICY "dept_head_dept_ipcr" ON hris.ipcr_records
  FOR SELECT USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

-- documents
DROP POLICY IF EXISTS "dept_head_dept_documents" ON hris.documents;
CREATE POLICY "dept_head_dept_documents" ON hris.documents
  FOR SELECT USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

-- service_records
DROP POLICY IF EXISTS "dept_head_dept_service_records" ON hris.service_records;
CREATE POLICY "dept_head_dept_service_records" ON hris.service_records
  FOR SELECT USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

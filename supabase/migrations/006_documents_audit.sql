-- Migration 006: Documents & Audit
SET search_path TO hris, public, auth, extensions;

-- Documents (201 Files, generated PDFs)
CREATE TABLE hris.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INT,
  mime_type TEXT,
  type document_type NOT NULL,
  reference_id UUID,                       -- FK to source record
  uploaded_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit Log (COA-ready)
CREATE TABLE hris.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  user_email TEXT,
  action TEXT NOT NULL,                    -- 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT'
  table_name TEXT,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Service Records (auto-generated from employee history)
CREATE TABLE hris.service_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  date_from DATE NOT NULL,
  date_to DATE,
  designation TEXT NOT NULL,
  status_type TEXT,                        -- Plantilla/COS/JO
  salary NUMERIC(12,2),
  office TEXT,
  branch TEXT,
  leave_without_pay INT DEFAULT 0,
  separation_date DATE,
  separation_cause TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_employees_department ON hris.employees(department_id);
CREATE INDEX idx_employees_status ON hris.employees(status);
CREATE INDEX idx_salary_history_employee ON hris.salary_history(employee_id);
CREATE INDEX idx_nosi_employee ON hris.nosi_records(employee_id);
CREATE INDEX idx_nosa_employee ON hris.nosa_records(employee_id);
CREATE INDEX idx_leave_employee ON hris.leave_applications(employee_id);
CREATE INDEX idx_attendance_employee_date ON hris.attendance_logs(employee_id, date);
CREATE INDEX idx_audit_log_user ON hris.audit_log(user_id);
CREATE INDEX idx_audit_log_table ON hris.audit_log(table_name, record_id);
CREATE INDEX idx_documents_employee ON hris.documents(employee_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION hris.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON hris.user_profiles FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON hris.employees FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
CREATE TRIGGER trg_nosi_updated_at BEFORE UPDATE ON hris.nosi_records FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
CREATE TRIGGER trg_nosa_updated_at BEFORE UPDATE ON hris.nosa_records FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
CREATE TRIGGER trg_leave_updated_at BEFORE UPDATE ON hris.leave_applications FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
CREATE TRIGGER trg_ipcr_updated_at BEFORE UPDATE ON hris.ipcr_records FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON hris.departments FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

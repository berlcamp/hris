-- Migration 004: Attendance & DTR
SET search_path TO hris, public, auth, extensions;

-- Attendance Logs
CREATE TABLE hris.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  date DATE NOT NULL,
  time_in_am TIMESTAMPTZ,
  time_out_am TIMESTAMPTZ,
  time_in_pm TIMESTAMPTZ,
  time_out_pm TIMESTAMPTZ,
  is_late BOOLEAN DEFAULT false,
  late_minutes INT DEFAULT 0,
  is_undertime BOOLEAN DEFAULT false,
  undertime_minutes INT DEFAULT 0,
  is_absent BOOLEAN DEFAULT false,
  remarks TEXT,
  source TEXT DEFAULT 'manual',            -- 'manual', 'biometric'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Monthly DTR Summary
CREATE TABLE hris.dtr_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  month INT NOT NULL,
  year INT NOT NULL,
  total_days_present INT DEFAULT 0,
  total_days_absent INT DEFAULT 0,
  total_late_minutes INT DEFAULT 0,
  total_undertime_minutes INT DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, month, year)
);

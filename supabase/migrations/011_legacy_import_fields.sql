-- Migration 011: Legacy import fields + service-record activity log
-- Adds columns required to absorb legacy `public.adm_employees` and
-- `public.hr_service_records` data without losing fidelity, plus a
-- per-record activity log to back the new Service Record CRUD UI.

SET search_path TO hris, public;

-- ── hris.employees: legacy + extended fields ──────────────────────────
ALTER TABLE hris.employees
  ADD COLUMN IF NOT EXISTS legacy_id BIGINT,
  ADD COLUMN IF NOT EXISTS id_number TEXT,
  ADD COLUMN IF NOT EXISTS item_number TEXT,
  ADD COLUMN IF NOT EXISTS old_item_number TEXT,
  ADD COLUMN IF NOT EXISTS office_code TEXT,
  ADD COLUMN IF NOT EXISTS office_assignment TEXT,
  ADD COLUMN IF NOT EXISTS position_level TEXT,
  ADD COLUMN IF NOT EXISTS original_appointment DATE,
  ADD COLUMN IF NOT EXISTS transfer_date DATE,
  ADD COLUMN IF NOT EXISTS promotion_date DATE,
  ADD COLUMN IF NOT EXISTS sss_number TEXT,
  ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS inactive_reason TEXT,
  ADD COLUMN IF NOT EXISTS inactive_effectivity_date DATE,
  ADD COLUMN IF NOT EXISTS legacy_status TEXT;

ALTER TABLE hris.employees
  DROP CONSTRAINT IF EXISTS employees_legacy_id_key;
ALTER TABLE hris.employees
  ADD CONSTRAINT employees_legacy_id_key UNIQUE (legacy_id);

CREATE INDEX IF NOT EXISTS idx_employees_legacy_id ON hris.employees(legacy_id);
CREATE INDEX IF NOT EXISTS idx_employees_id_number ON hris.employees(id_number);

-- ── hris.service_records: legacy + extended fields ────────────────────
ALTER TABLE hris.service_records
  ADD COLUMN IF NOT EXISTS legacy_id BIGINT,
  ADD COLUMN IF NOT EXISTS salary_grade INT,
  ADD COLUMN IF NOT EXISTS step_increment INT,
  ADD COLUMN IF NOT EXISTS agency TEXT,
  ADD COLUMN IF NOT EXISTS daily_salary NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES hris.user_profiles(id) ON DELETE SET NULL;

ALTER TABLE hris.service_records
  DROP CONSTRAINT IF EXISTS service_records_legacy_id_key;
ALTER TABLE hris.service_records
  ADD CONSTRAINT service_records_legacy_id_key UNIQUE (legacy_id);

CREATE INDEX IF NOT EXISTS idx_service_records_legacy_id ON hris.service_records(legacy_id);
CREATE INDEX IF NOT EXISTS idx_service_records_employee ON hris.service_records(employee_id);

DROP TRIGGER IF EXISTS trg_service_records_updated_at ON hris.service_records;
CREATE TRIGGER trg_service_records_updated_at
  BEFORE UPDATE ON hris.service_records
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── hris.service_records_activity_log ─────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.service_records_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_record_id UUID NOT NULL REFERENCES hris.service_records(id) ON DELETE CASCADE,
  user_id UUID REFERENCES hris.user_profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sr_activity_record ON hris.service_records_activity_log(service_record_id);
CREATE INDEX IF NOT EXISTS idx_sr_activity_user ON hris.service_records_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sr_activity_created ON hris.service_records_activity_log(created_at DESC);

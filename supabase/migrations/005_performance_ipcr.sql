-- Migration 005: Performance (IPCR)
SET search_path TO hris, public, auth, extensions;

-- IPCR Periods
CREATE TABLE hris.ipcr_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                      -- e.g., "Jan-Jun 2026"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- IPCR Records
CREATE TABLE hris.ipcr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  period_id UUID NOT NULL REFERENCES ipcr_periods(id),
  numerical_rating NUMERIC(4,2),
  adjectival_rating TEXT,                  -- Outstanding, Very Satisfactory, etc.
  status approval_status DEFAULT 'draft',
  reviewed_by UUID REFERENCES user_profiles(id),
  approved_by UUID REFERENCES user_profiles(id),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, period_id)
);

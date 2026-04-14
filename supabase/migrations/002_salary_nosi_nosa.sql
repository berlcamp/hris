-- Migration 002: Salary, NOSI, NOSA
SET search_path TO hris, public, auth, extensions;

-- Salary Grade Table (SSL reference)
CREATE TABLE hris.salary_grade_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade INT NOT NULL,
  step INT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  tranche INT NOT NULL DEFAULT 1,          -- SSL tranche
  effective_year INT NOT NULL,
  UNIQUE(grade, step, tranche)
);

-- Salary History
CREATE TABLE hris.salary_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  salary_grade INT NOT NULL,
  step INT NOT NULL,
  salary_amount NUMERIC(12,2) NOT NULL,
  effective_date DATE NOT NULL,
  reason salary_change_reason NOT NULL,
  reference_id UUID,                       -- FK to nosi or nosa record
  remarks TEXT,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- NOSI Records
CREATE TABLE hris.nosi_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  current_salary_grade INT NOT NULL,
  current_step INT NOT NULL,
  new_step INT NOT NULL,
  current_salary NUMERIC(12,2) NOT NULL,
  new_salary NUMERIC(12,2) NOT NULL,
  effective_date DATE NOT NULL,
  last_increment_date DATE,
  years_in_step INT,
  status approval_status DEFAULT 'draft',
  generated_by UUID REFERENCES user_profiles(id),
  reviewed_by UUID REFERENCES user_profiles(id),
  approved_by UUID REFERENCES user_profiles(id),
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- NOSA Records
CREATE TABLE hris.nosa_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  previous_salary_grade INT NOT NULL,
  previous_step INT NOT NULL,
  previous_salary NUMERIC(12,2) NOT NULL,
  new_salary_grade INT NOT NULL,
  new_step INT NOT NULL,
  new_salary NUMERIC(12,2) NOT NULL,
  reason salary_change_reason NOT NULL,
  effective_date DATE NOT NULL,
  status approval_status DEFAULT 'draft',
  generated_by UUID REFERENCES user_profiles(id),
  reviewed_by UUID REFERENCES user_profiles(id),
  approved_by UUID REFERENCES user_profiles(id),
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  legal_basis TEXT,                         -- e.g., "SSL Tranche 5", "Promotion"
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

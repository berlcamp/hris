-- Migration 003: Leave Management
SET search_path TO hris, public, auth, extensions;

-- Leave Types Configuration
CREATE TABLE hris.leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code leave_type_code UNIQUE NOT NULL,
  name TEXT NOT NULL,
  max_credits NUMERIC(5,2),               -- NULL = unlimited
  is_cumulative BOOLEAN DEFAULT false,     -- Can carry over
  is_convertible BOOLEAN DEFAULT false,    -- Cash conversion eligible
  applicable_to TEXT DEFAULT 'all',        -- 'all', 'female', 'male', 'solo_parent'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Leave Credits (per employee, per year)
CREATE TABLE hris.leave_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  year INT NOT NULL,
  total_credits NUMERIC(5,2) NOT NULL DEFAULT 0,
  used_credits NUMERIC(5,2) NOT NULL DEFAULT 0,
  balance NUMERIC(5,2) GENERATED ALWAYS AS (total_credits - used_credits) STORED,
  UNIQUE(employee_id, leave_type_id, year)
);

-- Leave Applications
CREATE TABLE hris.leave_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_applied NUMERIC(5,2) NOT NULL,
  reason TEXT,
  status approval_status DEFAULT 'pending',
  department_head_id UUID REFERENCES user_profiles(id),
  hr_reviewer_id UUID REFERENCES user_profiles(id),
  dept_approved_at TIMESTAMPTZ,
  hr_approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

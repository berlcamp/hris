-- Migration 001: Enums and Core Tables
SET search_path TO hris, public, auth, extensions;

-- Enums (created in hris schema)
CREATE TYPE hris.user_role AS ENUM ('super_admin', 'hr_admin', 'department_head', 'employee');
CREATE TYPE hris.employment_type AS ENUM ('plantilla', 'jo', 'cos');
CREATE TYPE hris.employee_status AS ENUM ('active', 'inactive', 'retired', 'terminated', 'resigned');
CREATE TYPE hris.approval_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE hris.leave_type_code AS ENUM ('VL', 'SL', 'ML', 'PL', 'SPL', 'FL', 'SoloParent', 'VAWC', 'RA9262', 'CL', 'AL', 'RL', 'SEL');
CREATE TYPE hris.document_type AS ENUM ('201_file', 'nosi', 'nosa', 'service_record', 'leave_form', 'dtr', 'ipcr', 'other');
CREATE TYPE hris.salary_change_reason AS ENUM ('initial', 'step_increment', 'promotion', 'reclassification', 'salary_standardization', 'adjustment', 'demotion');

-- Departments
CREATE TABLE hris.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  head_employee_id UUID,  -- FK added after employees table
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User Profiles (source of truth for access control)
CREATE TABLE hris.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  department_id UUID REFERENCES departments(id),
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Positions (Plantilla of Positions)
CREATE TABLE hris.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  item_number TEXT UNIQUE,              -- Plantilla item number
  salary_grade INT NOT NULL,
  department_id UUID REFERENCES departments(id),
  is_filled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Employees
CREATE TABLE hris.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID UNIQUE REFERENCES user_profiles(id),
  employee_no TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  suffix TEXT,
  birth_date DATE,
  gender TEXT,
  civil_status TEXT,
  address TEXT,
  phone TEXT,
  employment_type employment_type NOT NULL,
  position_id UUID REFERENCES positions(id),
  department_id UUID REFERENCES departments(id),
  salary_grade INT NOT NULL,
  step_increment INT NOT NULL DEFAULT 1,
  hire_date DATE NOT NULL,
  end_of_contract DATE,                  -- For JO/COS
  status employee_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add FK for department head
ALTER TABLE hris.departments
  ADD CONSTRAINT fk_dept_head FOREIGN KEY (head_employee_id) REFERENCES hris.employees(id);

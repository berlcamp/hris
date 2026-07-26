-- Migration 058: Contract of Service module — employee registry.
--
-- COS personnel get a dedicated table rather than living in hris.employees.
-- Contracts (COS-3) and the rebuilt COS payroll (COS-4) foreign-key here.
--
-- The registry starts EMPTY by design: no data is copied from hris.employees.
-- The dormant employment_type = 'cos' rows there are left untouched so their
-- attendance, DTR, leave, CTO and salary history are not cascade-deleted; they
-- are hidden from /employees in COS-4.
--
-- Soft delete: this is the first table in the schema to use deleted_at. Every
-- read must filter `deleted_at IS NULL`; the app funnels reads through a single
-- baseQuery() helper in cos-employee-actions.ts so the filter cannot be
-- forgotten.
SET search_path TO hris, public, auth, extensions;

CREATE TABLE hris.cos_employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity. cos_no is the "CMO ID No." column on the COS payroll printable
  -- (PayrollCosRow.cmoIdNo in src/lib/pdf/generatePayroll.ts).
  cos_no          TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  middle_name     TEXT,
  last_name       TEXT NOT NULL,
  suffix          TEXT,

  -- Personal information
  sex             TEXT CHECK (sex IN ('male', 'female')),
  birth_date      DATE,
  address         TEXT,
  contact_number  TEXT,
  email           TEXT,

  -- Employment information. position_title is free text: COS hires carry no
  -- plantilla item, so there is nothing to reference in hris.positions.
  department_id   UUID REFERENCES hris.departments(id) ON DELETE RESTRICT,
  position_title  TEXT,
  eligibility     TEXT,
  recommended_by  TEXT,
  remarks         TEXT,

  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES hris.user_profiles(id),
  updated_by      UUID REFERENCES hris.user_profiles(id),
  deleted_at      TIMESTAMPTZ
);

-- cos_no is unique among live rows only, so a soft-deleted record never blocks
-- reissuing its number.
CREATE UNIQUE INDEX uq_cos_employees_cos_no
  ON hris.cos_employees(cos_no) WHERE deleted_at IS NULL;

CREATE INDEX idx_cos_employees_name
  ON hris.cos_employees(lower(last_name), lower(first_name));
CREATE INDEX idx_cos_employees_department
  ON hris.cos_employees(department_id);
CREATE INDEX idx_cos_employees_status
  ON hris.cos_employees(status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_cos_employees_updated_at
  BEFORE UPDATE ON hris.cos_employees
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

GRANT ALL    ON hris.cos_employees TO service_role;
GRANT SELECT ON hris.cos_employees TO authenticated;

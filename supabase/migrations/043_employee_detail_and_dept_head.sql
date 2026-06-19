-- Migration 043: Employee "detailed to" department + department-head flag
--
-- Two new attributes used to drive the printable DTR signatory block:
--
--   detailed_department_id – when an employee is temporarily DETAILED to
--     another office, this points at that office. It does NOT change the
--     employee's home/plantilla department_id. The DTR signatory logic uses
--     the detailed department when set, otherwise the home department.
--
--   is_department_head – marks the employee as the head of their department.
--     Used both to pick the signatory for that employee's own DTR and to
--     resolve "the department head" who signs subordinates' DTRs.
--
-- DTR signatory rules (see src/lib/dtr-signatory.ts):
--   * effective department name/code contains "CMO"  -> City Mayor
--   * else employee is_department_head               -> City Administrator
--   * else                                           -> that department's head

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.employees
  ADD COLUMN IF NOT EXISTS detailed_department_id UUID,
  ADD COLUMN IF NOT EXISTS is_department_head BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE hris.employees
  DROP CONSTRAINT IF EXISTS employees_detailed_department_id_fkey;

ALTER TABLE hris.employees
  ADD CONSTRAINT employees_detailed_department_id_fkey
    FOREIGN KEY (detailed_department_id) REFERENCES hris.departments(id);

-- Speeds up "who is the head of department X" lookups during DTR generation.
CREATE INDEX IF NOT EXISTS idx_employees_dept_head
  ON hris.employees (department_id)
  WHERE is_department_head = true;

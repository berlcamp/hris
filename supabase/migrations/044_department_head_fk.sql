-- Migration 044: Department head pointer FK
--
-- departments.head_employee_id was declared in migration 001 with the note
-- "FK added after employees table" but the constraint was never added. The new
-- Departments settings (super-admin CRUD) keeps this column in sync with the
-- per-employee employees.is_department_head flag that drives the DTR signatory
-- block (see src/lib/dtr-signatory.ts): is_department_head stays the source of
-- truth, head_employee_id is a convenience pointer to the current head.
--
-- ON DELETE SET NULL so removing an employee doesn't block on this pointer.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.departments
  DROP CONSTRAINT IF EXISTS departments_head_employee_id_fkey;

ALTER TABLE hris.departments
  ADD CONSTRAINT departments_head_employee_id_fkey
    FOREIGN KEY (head_employee_id)
    REFERENCES hris.employees(id)
    ON DELETE SET NULL;

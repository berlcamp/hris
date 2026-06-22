-- Migration 045: Custom department-head name + pointer-based head resolution
--
-- Two related changes to the DTR signatory model (src/lib/dtr-signatory.ts):
--
-- 1. head_custom_name — some department heads are not in the active-employee
--    roster (e.g. appointed officials kept outside the plantilla). This column
--    lets Departments settings record a free-text head name printed on the DTR
--    when no employee head is assigned.
--
-- 2. departments.head_employee_id becomes the single source of truth for "who
--    is the head of this department." Resolving the head by the per-employee
--    employees.is_department_head flag + matching department_id could only ever
--    represent an employee heading their OWN home department; the pointer can
--    point at any employee, so one employee can now head several departments.
--    employees.is_department_head is kept only to drive case 2 (an employee who
--    is a head anywhere has their own DTR signed by the City Administrator).
--
-- Precedence for the printed head: head_employee_id wins; otherwise
-- head_custom_name. setDepartmentHead keeps the two mutually exclusive.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.departments
  ADD COLUMN IF NOT EXISTS head_custom_name TEXT;

-- Backfill the pointer from the legacy per-employee flag for any department
-- whose head was set the old way (employees.is_department_head) without the
-- departments.head_employee_id pointer being populated. One head per
-- department, chosen deterministically.
UPDATE hris.departments d
SET head_employee_id = sub.id
FROM (
  SELECT DISTINCT ON (department_id) id, department_id
  FROM hris.employees
  WHERE is_department_head = true AND department_id IS NOT NULL
  ORDER BY department_id, last_name, first_name
) sub
WHERE d.head_employee_id IS NULL
  AND d.id = sub.department_id;

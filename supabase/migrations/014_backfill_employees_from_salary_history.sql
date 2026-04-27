-- ============================================================
-- Backfill hris.employees.salary_grade and step_increment from
-- the latest hris.salary_history row per employee.
--
-- After this migration, salary_history is the source of truth for
-- an employee's current salary grade and step. The columns on
-- hris.employees are kept as a denormalized cache that the app
-- (syncEmployeeFromLatestSalaryHistory) keeps in sync after every
-- insert/update on salary_history.
--
-- Latest row is determined by (effective_date DESC, created_at DESC).
-- ============================================================

WITH latest AS (
  SELECT DISTINCT ON (employee_id)
    employee_id,
    salary_grade,
    step
  FROM hris.salary_history
  ORDER BY employee_id,
           effective_date DESC,
           created_at DESC
)
UPDATE hris.employees AS e
SET salary_grade   = latest.salary_grade,
    step_increment = latest.step
FROM latest
WHERE e.id = latest.employee_id
  AND (e.salary_grade   IS DISTINCT FROM latest.salary_grade
    OR e.step_increment IS DISTINCT FROM latest.step);

-- Migration 061: hris.job_order_employees.working_hours becomes TEXT.
--
-- This column was wrongly typed numeric(4,2) in migration 056. The legacy
-- `jos.working_hours` column it mirrors holds shift descriptors, not a
-- quantity — e.g. "7:00 PM - 7:00 AM" (7 real rows in the legacy export).
-- A number cannot represent that string, so any row with a real value would
-- fail to import at all.
--
-- Nothing in the app reads this column numerically today (see the
-- `grep -rn working_hours src/` audit that accompanies this migration), so
-- widening it to TEXT now is a no-op for existing behaviour. Doing this
-- later — after Spec 2's payroll module has been built assuming a numeric
-- working_hours — would be a much more painful migration, touching payroll
-- calculations instead of just a column type.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.job_order_employees
  ALTER COLUMN working_hours TYPE TEXT USING working_hours::text;

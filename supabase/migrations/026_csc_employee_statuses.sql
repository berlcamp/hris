-- Migration 026: CSC-aligned employee statuses + status change metadata.
--
-- Extends `hris.employee_status` enum with the legal/CSC statuses HR needs:
--   suspended  — preventive or punitive suspension (CSC Rule X)
--   awol       — Absent Without Official Leave (pre-Dropped From the Rolls)
--   dropped    — Dropped From the Rolls (after AWOL > 30 days, per CSC MC 14, s.2018)
--   deceased   — separated due to death
--
-- Also adds two columns to `hris.employees` so HR can capture *when* and *why*
-- a status changed without grepping the audit log:
--   status_effective_date — date the new status takes effect
--   status_remarks        — short narrative (e.g. memo no., legal basis)
--
-- All non-'active' statuses must be excluded from downstream HR automation
-- (leave accrual, payroll runs, dashboard counts). Those queries already
-- filter on status = 'active', so no further code changes are required at
-- the DB layer.

SET search_path TO hris, public, auth, extensions;

ALTER TYPE hris.employee_status ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE hris.employee_status ADD VALUE IF NOT EXISTS 'awol';
ALTER TYPE hris.employee_status ADD VALUE IF NOT EXISTS 'dropped';
ALTER TYPE hris.employee_status ADD VALUE IF NOT EXISTS 'deceased';

ALTER TABLE hris.employees
  ADD COLUMN IF NOT EXISTS status_effective_date DATE,
  ADD COLUMN IF NOT EXISTS status_remarks TEXT;

COMMENT ON COLUMN hris.employees.status_effective_date IS
  'Date the current `status` took effect (e.g. retirement date, suspension start).';
COMMENT ON COLUMN hris.employees.status_remarks IS
  'Free-text narrative for the current `status` — memo/order ref, legal basis, etc.';

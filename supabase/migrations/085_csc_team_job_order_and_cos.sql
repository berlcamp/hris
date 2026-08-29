-- csc_team on the other two personnel registries.
--
-- 083 put the column on hris.employees. The CSC anniversary teams are drawn
-- from the whole workforce, and Job Order and COS personnel are not in that
-- table — they have registries of their own — so the column has to exist in
-- all three places or two thirds of the roster has nowhere to record a team.
--
-- Same shape as 083 in every respect: free text, nullable, unset until
-- somebody is actually assigned.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.job_order_employees
  ADD COLUMN IF NOT EXISTS csc_team TEXT;

ALTER TABLE hris.cos_employees
  ADD COLUMN IF NOT EXISTS csc_team TEXT;

COMMENT ON COLUMN hris.job_order_employees.csc_team IS
  'CSC anniversary team label, e.g. "Group 1 - White Rhinos". Free text; NULL for anyone unassigned.';

COMMENT ON COLUMN hris.cos_employees.csc_team IS
  'CSC anniversary team label, e.g. "Group 1 - White Rhinos". Free text; NULL for anyone unassigned.';

CREATE INDEX IF NOT EXISTS idx_job_order_employees_csc_team
  ON hris.job_order_employees (csc_team)
  WHERE csc_team IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cos_employees_csc_team
  ON hris.cos_employees (csc_team)
  WHERE csc_team IS NOT NULL;

-- The CSC anniversary team an employee belongs to.
--
-- Free text rather than a lookup table or an enum: the teams are renamed every
-- year ("Group 1 (WHITE)" / "WHITE RHINOS" is a 2026 label), they carry no
-- rules, and nothing in HR computes anything from them. A table of eight rows
-- that is thrown away each anniversary buys nothing but joins.
--
-- Nullable and unset for everybody until somebody is actually assigned — most
-- of the workforce never is.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.employees
  ADD COLUMN IF NOT EXISTS csc_team TEXT;

COMMENT ON COLUMN hris.employees.csc_team IS
  'CSC anniversary team/group label, e.g. "Group 1 (WHITE)". Free text; NULL for anyone unassigned.';

CREATE INDEX IF NOT EXISTS idx_employees_csc_team
  ON hris.employees (csc_team)
  WHERE csc_team IS NOT NULL;

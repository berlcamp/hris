-- Migration 097: a stated Date of Filing on leave applications.
--
-- HR and OCM Admins encode paper applications after the fact, so the date on
-- CSC Form 6 can be earlier than the day the row was created.
--
-- This is a separate column because created_at cannot carry it: created_at
-- orders an employee's filings when credits are allocated between them (see
-- leave-actions.ts), and it is the true record of when the row was entered.
--
-- NULL means no date was stated: the application was filed on created_at's date.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.leave_applications
  ADD COLUMN IF NOT EXISTS date_filed DATE;

COMMENT ON COLUMN hris.leave_applications.date_filed IS
  'Date of Filing stated by an HR or OCM Admin. NULL: filed on the date of created_at.';

-- Migration 037: Track who filed each leave application.
--
-- Adds leave_applications.created_by (the user_profiles id of the filer) so the
-- "creator-only" cancellation rule and the "Created by Me" list filter actually
-- have a column to match against. Both features were shipped earlier assuming
-- this column existed, but it was never created and createLeaveApplication
-- never populated it — so every leave had created_by = NULL, which made the
-- creator check fail for everyone and hid the Cancel button regardless of the
-- approval stage.
--
-- Existing rows are backfilled to the applicant employee's linked login
-- (employees.user_profile_id) as a best-effort "creator", so employees can
-- cancel their own already-filed pending leaves. Rows whose applicant has no
-- linked user_profile stay NULL (uncancellable via the normal button).

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.leave_applications
  ADD COLUMN IF NOT EXISTS created_by UUID
    REFERENCES hris.user_profiles(id) ON DELETE SET NULL;

-- Backfill existing applications to the applicant's linked login.
UPDATE hris.leave_applications la
SET created_by = e.user_profile_id
FROM hris.employees e
WHERE la.employee_id = e.id
  AND la.created_by IS NULL
  AND e.user_profile_id IS NOT NULL;

-- Speeds up the "Created by Me" filter and the creator check.
CREATE INDEX IF NOT EXISTS idx_leave_applications_created_by
  ON hris.leave_applications (created_by);

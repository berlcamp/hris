-- Migration 068: direct-apply corrections.
--
-- Lets the roles that REVIEW corrections also file one that applies
-- immediately, so a single module can serve both audiences:
--
--   Department Admin  -> proof required, HR reviews, then it applies.
--   HR / DTR / OCM    -> proof optional, applies on submit, no second party.
--
-- The point is to retire the separate Manual Attendance Entry module without
-- forcing HR through a request lifecycle to fix one mistyped punch. Every
-- attendance write then lands in one place, with one audit story and one
-- re-import protection rule (source 'manual' + correction_locked).
--
-- Two things this deliberately does NOT do:
--   * It does not let a Department Admin self-approve. direct_apply is refused
--     for them in TypeScript (canDirectApplyAttendanceCorrection), and the
--     two-party guarantee for department-filed corrections is unchanged.
--   * It does not relax acr_no_overlapping_pending. That constraint is already
--     partial — WHERE status IN ('pending','needs_rebase') — so a request that
--     goes straight to 'approved' never holds the lock, and back-to-back
--     direct-applies for one employee cannot collide.

SET search_path TO hris, public, auth, extensions;

-- 1. Proof becomes optional ----------------------------------------------------
-- Only for direct-apply. A department asserting something HR cannot verify
-- still has to attach the office order / duty roster — that requirement is what
-- justifies delegating the power at all, and it is enforced by the CHECK below
-- rather than by application code alone.

ALTER TABLE hris.attendance_correction_requests
  ALTER COLUMN proof_path DROP NOT NULL;
ALTER TABLE hris.attendance_correction_requests
  ALTER COLUMN proof_filename DROP NOT NULL;

-- 2. The flag -------------------------------------------------------------------

ALTER TABLE hris.attendance_correction_requests
  ADD COLUMN IF NOT EXISTS direct_apply BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN hris.attendance_correction_requests.direct_apply IS
  'True when a reviewer-level role filed this and it applied on submit, with '
  'no separate approval step. False for the department-filed, proof-backed, '
  'two-party flow. Drives the proof requirement (see acr_proof_unless_direct) '
  'and tells a reader of the audit trail which path a change took.';

-- Existing rows all carry a proof_path (it was NOT NULL until a moment ago), so
-- this constraint validates without a rewrite of historic data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acr_proof_unless_direct'
  ) THEN
    ALTER TABLE hris.attendance_correction_requests
      ADD CONSTRAINT acr_proof_unless_direct
      CHECK (direct_apply OR proof_path IS NOT NULL);
  END IF;
END $$;

-- Finding "what did HR change directly" is a routine audit question, and the
-- flag is low-cardinality — index only the rows that are true.
CREATE INDEX IF NOT EXISTS idx_acr_direct_apply
  ON hris.attendance_correction_requests(direct_apply)
  WHERE direct_apply;

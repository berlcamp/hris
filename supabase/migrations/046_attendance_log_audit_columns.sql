-- Migration 046: Record who created / last edited an attendance log
--
-- Manual attendance entries (and corrections) are made by HR / DTR staff. These
-- columns capture who first recorded an entry and who last edited it, so the
-- attendance list can show an accountability trail. They are populated by the
-- server actions (createAttendanceEntry / createAttendanceEntriesBulk) using the
-- signed-in user; the original creator is preserved across later edits.
--
-- created_by / updated_by store the user_profiles id; the *_email columns hold a
-- denormalized copy for display without an extra join. updated_* stay NULL until
-- an entry is edited after its initial creation.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.attendance_logs
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS created_by_email TEXT,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by_email TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

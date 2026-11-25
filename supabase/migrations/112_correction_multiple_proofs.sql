-- Migration 112: several supporting documents per attendance correction.
--
-- proof_path / proof_filename / proof_mime / proof_size keep describing the
-- FIRST document, so acr_proof_unless_direct (migration 068) still enforces the
-- proof requirement and older readers keep working. proof_files lists every
-- document, the first included: [{path, filename, mime, size}, ...].
--
-- No backfill: an empty list means "read the single proof_* columns", which is
-- also how DTR Creator filings (migration 110) are stored.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.attendance_correction_requests
  ADD COLUMN IF NOT EXISTS proof_files JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN hris.attendance_correction_requests.proof_files IS
  'Every supporting document as [{path, filename, mime, size}]. Empty means the '
  'single document, if any, is in the proof_* columns.';

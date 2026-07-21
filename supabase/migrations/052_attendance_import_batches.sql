-- Migration 052: Saved biometric import batches (for replay)
--
-- Every Dahua import parses raw punches in the browser, sends them to the server,
-- buckets them into AM/PM slots, and persists only the bucketed daily result to
-- hris.attendance_logs -- the raw punches were thrown away. That meant fixing a
-- bucketing bug (e.g. an early-release day mislabeled by the device) required
-- re-uploading the original export file.
--
-- This table stores the raw parsed punches for each import so any import can be
-- re-bucketed on demand ("replay") without the original file. `punches` is the
-- compact parsed rows exactly as sent to the importer:
--   [{ employeeNo, employeeName, date, time, status }]
-- Replay re-matches employees by biometric_no and re-buckets with the current
-- logic, skipping any day whose attendance_logs row is no longer source =
-- 'biometric' (i.e. a manager corrected it since), so human edits are never lost.
--
-- Accessed only through attendance-manager server actions on the admin client,
-- matching hris.holidays (no RLS policies of its own).

SET search_path TO hris, public, auth, extensions;

CREATE TABLE IF NOT EXISTS hris.attendance_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by UUID REFERENCES hris.user_profiles(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Min / max punch date in the batch -- the period label shown in the list.
  period_start DATE,
  period_end DATE,
  punch_count INTEGER NOT NULL DEFAULT 0,
  -- Raw parsed punches: [{ employeeNo, employeeName, date, time, status }]
  punches JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_import_batches_imported_at
  ON hris.attendance_import_batches(imported_at DESC);

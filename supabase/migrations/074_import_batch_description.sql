-- Migration 074: every saved import carries a description
--
-- The "Past imports" list identified a batch only by its punch date range, the
-- import timestamp and who ran it. That is enough to tell two imports apart
-- when there are two; it is not enough to find the right one months later,
-- when several imports cover overlapping ranges because a device was exported
-- twice, or a period was re-imported after a correction. Replay is the one
-- operation that reaches back into an old batch, so the batch has to be
-- identifiable by something a person chose — "Main gate, 1st half of July"
-- beats "Jul 1 – Jul 15" when there are three of those.
--
-- The column is NOT NULL and non-blank: a description nobody had to supply is
-- a description nobody supplies, and the list is back where it started.
--
-- Existing rows are backfilled from what the table already knows, so they read
-- sensibly rather than as an empty cell. The backfill runs before the NOT NULL
-- so a table with rows in it does not reject the constraint.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.attendance_import_batches
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Period range when the batch has one, otherwise the import date. Matches the
-- label the panel used to build in the browser, so nothing appears to change
-- for imports that predate this migration.
UPDATE hris.attendance_import_batches
SET description = CASE
      WHEN period_start IS NOT NULL AND period_end IS NOT NULL
        THEN to_char(period_start, 'DD Mon YYYY') || ' – ' || to_char(period_end, 'DD Mon YYYY')
      ELSE 'Import of ' || to_char(imported_at AT TIME ZONE 'Asia/Manila', 'DD Mon YYYY')
    END
WHERE description IS NULL OR btrim(description) = '';

ALTER TABLE hris.attendance_import_batches
  ALTER COLUMN description SET NOT NULL;

-- Whitespace is not a description. Re-runnable: dropped first, like the reason
-- CHECK constraints in migrations 053/054/065/067.
ALTER TABLE hris.attendance_import_batches
  DROP CONSTRAINT IF EXISTS attendance_import_batches_description_not_blank;

ALTER TABLE hris.attendance_import_batches
  ADD CONSTRAINT attendance_import_batches_description_not_blank
  CHECK (btrim(description) <> '');

COMMENT ON COLUMN hris.attendance_import_batches.description IS
  'Human-supplied label for this import, required at import time. The primary '
  'way an attendance manager identifies a batch in the Past Imports list when '
  'choosing one to replay.';

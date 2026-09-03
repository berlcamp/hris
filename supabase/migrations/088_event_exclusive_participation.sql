-- Migration 088: "one event only" — the flag that makes a set of events
-- mutually exclusive, and warns the officer at the door when somebody who has
-- already been counted at one of them shows up at another.
--
-- The case this exists for: an LGU runs the same seminar on four dates, or
-- hands out the same allowance at four barangay gyms, and a person is entitled
-- to exactly one of them. Nothing in the schema could say that — every event
-- was independent, so the same card scanned cleanly at all four.
--
-- ── Why a flag on the event, not a group table ───────────────────────────
-- The rule HR actually states is "these are the ones you only get once", and
-- every flagged event is exclusive against every OTHER flagged event. A
-- grouping table would let HR build overlapping sets nobody asked for and force
-- a second screen to maintain them. If separate exclusive GROUPS are ever
-- needed, this column becomes the group key and the default stays false.
--
-- ── Why it warns rather than blocks ──────────────────────────────────────
-- Same reason a walk-in is recorded rather than refused (migration 081): the
-- officer at the door cannot adjudicate an entitlement, and one who cannot
-- record a person standing in front of them will reach for paper. The scan
-- lands, flagged, and HR settles it from the report — where the duplicate is
-- now visible instead of silently absent.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.events
  ADD COLUMN IF NOT EXISTS exclusive_participation BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN hris.events.exclusive_participation IS
  'One event only: warn at scan time when this person has already been recorded at another event carrying the same flag. A warning, never a rejection.';

-- The prior-participation lookup starts by listing the OTHER flagged events, so
-- the flagged ones need to be findable without a scan of every event ever run.
CREATE INDEX IF NOT EXISTS idx_events_exclusive
  ON hris.events (exclusive_participation)
  WHERE exclusive_participation AND deleted_at IS NULL;

-- The lookup then asks "has this person been recorded at any of them" — a
-- subject-first question the existing (event_id, attendance_date) index cannot
-- answer.
CREATE INDEX IF NOT EXISTS idx_event_attendance_subject
  ON hris.event_attendance (subject_kind, subject_id);

NOTIFY pgrst, 'reload schema';

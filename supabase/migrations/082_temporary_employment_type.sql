-- Temporary personnel.
--
-- A temporary employee is the thinnest record this system keeps: a name and
-- nothing else. No plantilla item, no salary grade that means anything, no
-- department worth printing. They exist here for one reason — they attend
-- events, so they need a roster entry and a QR card.
--
-- They live in hris.employees rather than a registry of their own (as Job
-- Order and COS do) because they are employees in every sense the rest of the
-- system cares about; only their payroll and plantilla mechanics are absent.
-- Every module that computes pay, DTR, leave or step increments already
-- filters `employment_type = 'plantilla'`, so the new value is inert there.

SET search_path TO hris, public, auth, extensions;

ALTER TYPE hris.employment_type ADD VALUE IF NOT EXISTS 'temporary';

-- The events module keys every attendee as (subject_kind, subject_id) with no
-- foreign key — see 081. 'temporary' is a fourth kind: same employees table as
-- 'employee', different segment, and the roster/card screens list it
-- separately because a temporary carries no department or employment label
-- worth showing.
ALTER TABLE hris.qr_credentials
  DROP CONSTRAINT IF EXISTS qr_credentials_subject_kind_check;
ALTER TABLE hris.qr_credentials
  ADD CONSTRAINT qr_credentials_subject_kind_check
  CHECK (subject_kind IN ('employee', 'job_order', 'cos', 'temporary'));

ALTER TABLE hris.event_roster
  DROP CONSTRAINT IF EXISTS event_roster_subject_kind_check;
ALTER TABLE hris.event_roster
  ADD CONSTRAINT event_roster_subject_kind_check
  CHECK (subject_kind IN ('employee', 'job_order', 'cos', 'temporary'));

ALTER TABLE hris.event_attendance
  DROP CONSTRAINT IF EXISTS event_attendance_subject_kind_check;
ALTER TABLE hris.event_attendance
  ADD CONSTRAINT event_attendance_subject_kind_check
  CHECK (subject_kind IN ('employee', 'job_order', 'cos', 'temporary'));

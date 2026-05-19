-- Migration 030: Work Schedules
--
-- Adds reusable shift templates and a per-employee assignment. A schedule
-- defines clock-in / clock-out times and an optional lunch / break window. If
-- break_start and break_end are NULL, the shift has no break and the employee
-- does not need to punch in/out for lunch (single clock-in + clock-out).
--
-- A schedule whose time_out <= time_in is treated as crossing midnight
-- (e.g. 22:00 → 05:00). The Dahua importer uses the assigned schedule to
-- bucket raw biometric punches into the correct duty date and the AM/PM slots
-- on attendance_logs.
--
-- One schedule per employee. Unassigned employees fall back to the historical
-- 8:00–17:00 with a 12:00–13:00 lunch in late/undertime computations.

SET search_path TO hris, public, auth, extensions;

CREATE TABLE IF NOT EXISTS hris.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  time_in TIME NOT NULL,
  time_out TIME NOT NULL,
  break_start TIME,
  break_end TIME,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Either both break columns are set or neither is.
  CONSTRAINT schedules_break_pair_chk CHECK (
    (break_start IS NULL AND break_end IS NULL)
    OR (break_start IS NOT NULL AND break_end IS NOT NULL)
  )
);

ALTER TABLE hris.employees
  ADD COLUMN IF NOT EXISTS schedule_id UUID
    REFERENCES hris.schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_schedule_id
  ON hris.employees(schedule_id);

-- Seed two reference shifts so admins have a working starting point.
INSERT INTO hris.schedules (name, time_in, time_out, break_start, break_end, notes)
VALUES
  ('Regular 8:00 AM – 5:00 PM', '08:00', '17:00', '12:00', '13:00',
    'Standard government office hours with one-hour lunch break.'),
  ('Night Shift 10:00 PM – 5:00 AM', '22:00', '05:00', NULL, NULL,
    'Seven-hour night shift, no break-time punching required.')
ON CONFLICT (name) DO NOTHING;

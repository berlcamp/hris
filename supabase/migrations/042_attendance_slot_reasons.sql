-- Migration 042: Per-slot attendance reasons
--
-- A reason a SPECIFIC time slot is blank but is not an absence — the employee
-- was on official duty for that part of the day. One per slot, each one of:
--   'travel'            – TRAVEL
--   'field_work'        – FIELD WORK (DTR shortcut: FW)
--   'official_business' – OFFICIAL BUSINESS (DTR shortcut: OB)
--
-- On the printable DTR the slot prints the reason shortcut instead of a time,
-- the day is not counted as absent, and tardiness/undertime is not charged
-- because the missing punch is excused.
--
-- Supersedes the day-level hris.attendance_logs.no_time_reason (migration 041),
-- which is kept only so previously-saved rows still render.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.attendance_logs
  ADD COLUMN IF NOT EXISTS time_in_am_reason TEXT
    CHECK (time_in_am_reason IN ('travel', 'field_work', 'official_business')),
  ADD COLUMN IF NOT EXISTS time_out_am_reason TEXT
    CHECK (time_out_am_reason IN ('travel', 'field_work', 'official_business')),
  ADD COLUMN IF NOT EXISTS time_in_pm_reason TEXT
    CHECK (time_in_pm_reason IN ('travel', 'field_work', 'official_business')),
  ADD COLUMN IF NOT EXISTS time_out_pm_reason TEXT
    CHECK (time_out_pm_reason IN ('travel', 'field_work', 'official_business'));

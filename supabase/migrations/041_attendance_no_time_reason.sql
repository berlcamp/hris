-- Migration 041: Attendance no-time reason
--
-- A reason a manual attendance entry has no time punches but should NOT be
-- treated as an absence — the employee was out on official duty. One of:
--   'travel'            – TRAVEL
--   'field_work'        – FIELD WORK
--   'official_business' – OFFICIAL BUSINESS
--
-- When set, the printable DTR prints the reason label across the day's row
-- (like ON LEAVE) and the day is not counted as absent.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.attendance_logs
  ADD COLUMN IF NOT EXISTS no_time_reason TEXT
    CHECK (no_time_reason IN ('travel', 'field_work', 'official_business'));

-- Migration 047: Per-entry schedule override on attendance logs
--
-- Some employees rotate shifts daily or weekly, so a single employee-level
-- schedule (hris.employees.schedule_id) can't describe every day correctly.
-- This column lets a DTR manager / super admin pin a specific schedule to a
-- specific day's attendance entry.
--
-- NULL means "inherit": late / undertime and punch bucketing fall back to the
-- employee's assigned schedule (or the org default) exactly as before. When set,
-- the manual-entry action and the DTR builders compute that day against THIS
-- schedule instead. ON DELETE SET NULL so removing a schedule just reverts the
-- affected days to the inherited schedule rather than deleting attendance.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.attendance_logs
  ADD COLUMN IF NOT EXISTS schedule_id UUID
    REFERENCES hris.schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_schedule_id
  ON hris.attendance_logs(schedule_id);

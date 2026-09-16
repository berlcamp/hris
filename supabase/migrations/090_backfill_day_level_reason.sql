-- Migration 090: backfill no_time_reason on punchless days that only ever got
-- per-slot reasons.
--
-- The correction form has no day-level reason field — a whole-day LEAVE is
-- entered as `leave` on each of the four slot dropdowns — and
-- buildAttendanceRecord wrote only those four columns, leaving
-- attendance_logs.no_time_reason NULL. The DTR's full-day-holiday branch keys
-- off no_time_reason to decide that somebody made a statement about THIS
-- employee's day, so a day corrected to LEAVE that happened to fall on a
-- declared holiday printed HOLIDAY and discarded the slot reasons entirely.
-- The same applied to TRAVEL, FIELD WORK, OFFICIAL BUSINESS, SATURDAY, SUNDAY
-- and RETIRED; only `off` escaped it, because clear_as_off sets
-- no_time_reason explicitly.
--
-- src/lib/attendance-record.ts now derives it (dayReasonFor) for every row it
-- writes. This closes the gap for rows already on record.
--
-- Scope, deliberately narrow:
--   * no_time_reason IS NULL          — never overwrite a stated day.
--   * all four punches NULL           — a day with punches is told by its
--                                       times; a slot reason there explains
--                                       one missing punch, not the whole day.
--   * at least one slot reason set    — a punchless day with no reason at all
--                                       is a real absence and stays one.
--
-- First non-null slot reason wins, matching dayReasonFor and the correction
-- form's preview.
--
-- No deduction recompute follows: hris.compute_attendance_deduction_minutes
-- returns zero for a day with no punches before it ever looks at
-- no_time_reason (migration 072, and unchanged by 073/075), so every row
-- touched here already deducts nothing and still will. This is a label fix.
--
-- Re-runnable: the WHERE clause excludes every row a previous run updated.

SET search_path TO hris, public, auth, extensions;

UPDATE hris.attendance_logs
SET no_time_reason = COALESCE(
      time_in_am_reason,
      time_out_am_reason,
      time_in_pm_reason,
      time_out_pm_reason
    )
WHERE no_time_reason IS NULL
  AND time_in_am  IS NULL
  AND time_out_am IS NULL
  AND time_in_pm  IS NULL
  AND time_out_pm IS NULL
  AND COALESCE(
        time_in_am_reason,
        time_out_am_reason,
        time_in_pm_reason,
        time_out_pm_reason
      ) IS NOT NULL;

-- Migration 095: Remove the blank ABSENT rows that "Include all" corrections wrote
--
-- A correction filed over a whole range (Include all, Oct 1–31) sent an item for
-- EVERY day in it, including days whose punches had not been imported yet. Each
-- such item had no time, no reason and no Clear as off, and the day had no
-- attendance row, so applying it INSERTED a row with no punches — is_absent,
-- source 'manual', correction_locked. When the biometric file for those days was
-- imported later, the re-sort (resortDaysForPunches) left them alone, as it does
-- every day a person wrote: the punches reached hris.attendance_punches and the
-- DTR, which reads only attendance_logs, still printed ABSENT.
--
-- The app no longer writes these rows (isBlankCreateItem in
-- src/lib/attendance-corrections.ts drops the item when filing and again when
-- applying). This removes the ones already written, so a day reads as it would
-- have had the item never been filed:
--   * a day whose punches are in the pool is filled in by replaying its import
--     batch (the Dahua import dialog → Past imports → Replay), which no longer finds a
--     locked row in the way;
--   * a weekday with no punches still prints ABSENT — that is what a weekday
--     with no row prints — and an approved leave or a half-day holiday on it
--     now prints as such instead of ABSENT;
--   * VL deductions do not change: compute_attendance_deduction_minutes skips
--     is_absent rows, so these rows never contributed a minute.
--
-- Only rows matching ALL of the following are removed: no punches, no slot
-- reasons, no day-level reason, absent, manual + locked, and created in the same
-- transaction (applied_at = created_at) by an APPROVED correction whose item for
-- that date was itself a blank CREATE item, and that no later correction item
-- references. A row anyone has edited since — times, a reason, a later
-- correction — no longer matches and is kept.
--
-- Every removed row is copied into hris.audit_log first.

SET search_path TO hris, public, auth, extensions;

WITH removed AS (
  DELETE FROM hris.attendance_logs l
  WHERE l.source = 'manual'
    AND l.correction_locked
    AND l.is_absent
    AND l.time_in_am IS NULL
    AND l.time_out_am IS NULL
    AND l.time_in_pm IS NULL
    AND l.time_out_pm IS NULL
    AND l.time_in_am_reason IS NULL
    AND l.time_out_am_reason IS NULL
    AND l.time_in_pm_reason IS NULL
    AND l.time_out_pm_reason IS NULL
    AND l.no_time_reason IS NULL
    AND EXISTS (
      SELECT 1
      FROM hris.attendance_correction_items i
      JOIN hris.attendance_correction_requests r ON r.id = i.request_id
      WHERE r.employee_id = l.employee_id
        AND r.status = 'approved'
        AND r.applied_at = l.created_at
        AND i.duty_date = l.date
        AND i.attendance_log_id IS NULL
        AND i.disposition = 'update'
        AND i.proposed_time_in_am IS NULL
        AND i.proposed_time_out_am IS NULL
        AND i.proposed_time_in_pm IS NULL
        AND i.proposed_time_out_pm IS NULL
        AND i.proposed_in_am_reason IS NULL
        AND i.proposed_out_am_reason IS NULL
        AND i.proposed_in_pm_reason IS NULL
        AND i.proposed_out_pm_reason IS NULL
    )
    -- A later correction that targeted this row as an existing day still
    -- references it (attendance_correction_items_attendance_log_id_fkey), and
    -- somebody reviewed the day a second time. None of these carry pooled
    -- punches; they are left as they are.
    AND NOT EXISTS (
      SELECT 1
      FROM hris.attendance_correction_items later
      WHERE later.attendance_log_id = l.id
    )
  RETURNING l.*
)
INSERT INTO hris.audit_log (action, table_name, record_id, old_values, new_values)
SELECT 'attendance_blank_correction_row_removed',
       'attendance_logs',
       removed.id,
       to_jsonb(removed),
       jsonb_build_object('migration', '095_remove_blank_correction_rows')
FROM removed;

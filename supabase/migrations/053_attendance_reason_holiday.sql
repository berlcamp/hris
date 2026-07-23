-- Migration 053: Allow 'holiday' as an attendance reason
--
-- Adds 'holiday' to the reason codes accepted by the per-slot reason columns
-- (migration 042) and the legacy day-level column (migration 041). Picking it
-- on an attendance entry prints HOLIDAY in that DTR slot instead of a time,
-- keeps the day off the absence count, and excuses the tardiness/undertime
-- tied to that slot — same handling as the official-duty reasons.

SET search_path TO hris, public, auth, extensions;

DO $$
DECLARE
  col TEXT;
  allowed CONSTANT TEXT :=
    '''travel'', ''field_work'', ''official_business'', ''holiday''';
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'no_time_reason',
    'time_in_am_reason',
    'time_out_am_reason',
    'time_in_pm_reason',
    'time_out_pm_reason'
  ] LOOP
    -- Drop the auto-named inline CHECK from 041/042 (and this migration's own
    -- constraint) so the migration is re-runnable.
    EXECUTE format(
      'ALTER TABLE hris.attendance_logs DROP CONSTRAINT IF EXISTS %I',
      'attendance_logs_' || col || '_check'
    );
    EXECUTE format(
      'ALTER TABLE hris.attendance_logs DROP CONSTRAINT IF EXISTS %I',
      'attendance_logs_' || col || '_allowed'
    );
    EXECUTE format(
      'ALTER TABLE hris.attendance_logs ADD CONSTRAINT %I CHECK (%I IN (%s))',
      'attendance_logs_' || col || '_allowed', col, allowed
    );
  END LOOP;
END $$;

-- Migration 054: Allow 'off' as an attendance reason
--
-- Adds 'off' (DTR label: OFF) to the reason codes accepted by the per-slot
-- reason columns (migration 042) and the legacy day-level column (migration
-- 041), alongside 'holiday' from migration 053. Same handling as the other
-- reasons: the DTR prints OFF in that slot instead of a time, the day is not
-- counted absent, and no tardiness/undertime is charged for the slot.

SET search_path TO hris, public, auth, extensions;

DO $$
DECLARE
  col TEXT;
  allowed CONSTANT TEXT :=
    '''travel'', ''field_work'', ''official_business'', ''holiday'', ''off''';
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'no_time_reason',
    'time_in_am_reason',
    'time_out_am_reason',
    'time_in_pm_reason',
    'time_out_pm_reason'
  ] LOOP
    -- Drop both the auto-named inline CHECK from 041/042 and the named one
    -- from 053, so this migration is re-runnable and order-independent.
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

-- Migration 079: RETIRED reason code.
--
-- A day the employee had already retired on is not an absence: no punches are
-- expected and no deduction should follow. The deduction functions already
-- treat ANY non-null reason as excused (migration 075's v_day_excused), so the
-- code only has to be admitted by the CHECK constraints.
--
-- Same re-runnable DO-block pattern as migrations 053, 054, 065 and 067: drop
-- both the auto-named inline CHECK and the previous named one, then re-add
-- widened.

SET search_path TO hris, public, auth, extensions;

DO $$
DECLARE
  col TEXT;
  allowed CONSTANT TEXT :=
    '''travel'', ''field_work'', ''official_business'', ''holiday'', ''off'', '
    '''no_break'', ''saturday'', ''sunday'', ''leave'', ''retired''';
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'no_time_reason',
    'time_in_am_reason',
    'time_out_am_reason',
    'time_in_pm_reason',
    'time_out_pm_reason'
  ] LOOP
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

-- The correction-item proposals stay one code narrower than the column they
-- feed: 'holiday' is org-wide and managed centrally in hris.holidays
-- (migration 040). RETIRED is per-employee by nature, so it belongs here.
DO $$
DECLARE
  col TEXT;
  allowed CONSTANT TEXT :=
    '''travel'', ''field_work'', ''official_business'', ''off'', '
    '''no_break'', ''saturday'', ''sunday'', ''leave'', ''retired''';
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'proposed_in_am_reason',
    'proposed_out_am_reason',
    'proposed_in_pm_reason',
    'proposed_out_pm_reason'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE hris.attendance_correction_items DROP CONSTRAINT IF EXISTS %I',
      'attendance_correction_items_' || col || '_check'
    );
    EXECUTE format(
      'ALTER TABLE hris.attendance_correction_items DROP CONSTRAINT IF EXISTS %I',
      'attendance_correction_items_' || col || '_allowed'
    );
    EXECUTE format(
      'ALTER TABLE hris.attendance_correction_items ADD CONSTRAINT %I CHECK (%I IN (%s))',
      'attendance_correction_items_' || col || '_allowed', col, allowed
    );
  END LOOP;
END $$;

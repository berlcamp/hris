-- Migration 098: ABSENT as a per-slot attendance reason.
--
-- The correction form can now state that a session was not served: ABSENT on AM
-- In and AM Out, or on PM In and PM Out. The DTR prints it in those cells.
--
-- Every other reason explains a missing punch and excuses its charge. ABSENT
-- confirms the punch is missing, so it must NOT excuse anything:
--   * a session marked ABSENT stays charged its flat half day;
--   * a day with no punches and only ABSENT slots is an ordinary absence
--     (is_absent, charged by the DTR, skipped by the VL deduction as before);
--   * a punchless day with one session ABSENT and the other explained by a real
--     reason (OB in the afternoon, say) is not is_absent, so nothing else would
--     charge it: the absent half is charged its half day here.
--
-- The code is admitted on the four slot columns and the four proposal columns
-- only. no_time_reason stays as it was: a day-level reason excuses both sessions,
-- so 'absent' can never be one (dayReasonFor in src/lib/attendance-record.ts).
--
-- hris.day_late_undertime mirrors dayLateUndertime in
-- src/lib/attendance-schedule.ts. compute_attendance_deduction_minutes delegates
-- to it and does not change. No stored row carries the code yet, so no recompute
-- is needed.
--
-- Same re-runnable DO-block pattern as migrations 053, 054, 065, 067 and 079.

SET search_path TO hris, public, auth, extensions;

DO $$
DECLARE
  col TEXT;
  allowed CONSTANT TEXT :=
    '''travel'', ''field_work'', ''official_business'', ''holiday'', ''off'', '
    '''no_break'', ''saturday'', ''sunday'', ''leave'', ''retired'', ''absent''';
BEGIN
  FOREACH col IN ARRAY ARRAY[
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

-- The proposals stay one code narrower than the columns they feed: 'holiday' is
-- org-wide and managed centrally in hris.holidays (migration 040).
DO $$
DECLARE
  col TEXT;
  allowed CONSTANT TEXT :=
    '''travel'', ''field_work'', ''official_business'', ''off'', '
    '''no_break'', ''saturday'', ''sunday'', ''leave'', ''retired'', ''absent''';
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

-- Same signature as migration 094, so the existing grant carries over.
CREATE OR REPLACE FUNCTION hris.day_late_undertime(
  p_date            DATE,
  p_time_in         TIME,
  p_time_out        TIME,
  p_break_start     TIME,
  p_break_end       TIME,
  p_in_am           TIMESTAMPTZ,
  p_out_am          TIMESTAMPTZ,
  p_in_pm           TIMESTAMPTZ,
  p_out_pm          TIMESTAMPTZ,
  p_reason_in_am    TEXT DEFAULT NULL,
  p_reason_out_am   TEXT DEFAULT NULL,
  p_reason_in_pm    TEXT DEFAULT NULL,
  p_reason_out_pm   TEXT DEFAULT NULL,
  p_no_time_reason  TEXT DEFAULT NULL,
  p_excuse_am       BOOLEAN DEFAULT FALSE,
  p_excuse_pm       BOOLEAN DEFAULT FALSE,
  -- Whether the employee's schedule makes this a rest day
  -- (hris.resolve_day_schedule). NULL: Saturday/Sunday, as before.
  p_rest_day        BOOLEAN DEFAULT NULL,
  OUT late_minutes  INT,
  OUT undertime_minutes INT
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_crosses     BOOLEAN;
  v_has_break   BOOLEAN;
  v_am_off      BOOLEAN;
  v_pm_off      BOOLEAN;
  -- The slot reasons that excuse. ABSENT is a statement, not an excuse.
  v_in_am_why   TEXT := NULLIF(p_reason_in_am,  'absent');
  v_out_am_why  TEXT := NULLIF(p_reason_out_am, 'absent');
  v_in_pm_why   TEXT := NULLIF(p_reason_in_pm,  'absent');
  v_out_pm_why  TEXT := NULLIF(p_reason_out_pm, 'absent');
  v_am_absent   BOOLEAN := 'absent' IN (p_reason_in_am, p_reason_out_am);
  v_pm_absent   BOOLEAN := 'absent' IN (p_reason_in_pm, p_reason_out_pm);
  -- The stored punches as Manila wall clock (see the TIMEZONE note in 070).
  w_in_am       TIMESTAMP;
  w_in_pm       TIMESTAMP;
  w_out_pm      TIMESTAMP;
  v_sched_in    TIMESTAMP;
  v_sched_out   TIMESTAMP;
  v_sched_bend  TIMESTAMP;
BEGIN
  late_minutes := 0;
  undertime_minutes := 0;

  -- A rest day owes no hours, so nothing is charged on it.
  IF COALESCE(p_rest_day, hris.is_rest_day(p_date)) THEN
    RETURN;
  END IF;

  v_has_break := (p_break_start IS NOT NULL AND p_break_end IS NOT NULL);

  -- A day with NO punches at all is an absence; the DTR charges it there. The
  -- exception is one session ABSENT and the other explained by a reason: that
  -- row is not is_absent, so the absent half is charged below.
  IF p_in_am IS NULL AND p_out_am IS NULL
     AND p_in_pm IS NULL AND p_out_pm IS NULL
     AND NOT (
       v_has_break AND (
         (COALESCE(v_am_absent, FALSE)
            AND (v_in_pm_why IS NOT NULL OR v_out_pm_why IS NOT NULL))
         OR (COALESCE(v_pm_absent, FALSE)
            AND (v_in_am_why IS NOT NULL OR v_out_am_why IS NOT NULL))
       )
     ) THEN
    RETURN;
  END IF;

  w_in_am  := p_in_am  AT TIME ZONE 'UTC';
  w_in_pm  := p_in_pm  AT TIME ZONE 'UTC';
  w_out_pm := p_out_pm AT TIME ZONE 'UTC';

  v_crosses   := (p_time_out <= p_time_in);
  v_am_off    := p_no_time_reason IS NOT NULL OR COALESCE(p_excuse_am, FALSE);
  v_pm_off    := p_no_time_reason IS NOT NULL OR COALESCE(p_excuse_pm, FALSE);

  -- Scheduled in is always on the duty date. Scheduled out lands on the next
  -- calendar day when the shift crosses midnight.
  v_sched_in := (p_date::timestamp) + p_time_in;
  IF v_crosses THEN
    v_sched_out := ((p_date + 1)::timestamp) + p_time_out;
  ELSE
    v_sched_out := (p_date::timestamp) + p_time_out;
  END IF;

  -- A session with BOTH cells blank rendered no service: a flat half day,
  -- unless excused or explained by a reason on either of its slots.
  IF v_has_break THEN
    IF p_in_am IS NULL AND p_out_am IS NULL AND NOT v_am_off
       AND v_in_am_why IS NULL AND v_out_am_why IS NULL THEN
      undertime_minutes := undertime_minutes + hris.half_day_undertime_minutes();
    END IF;
    IF p_in_pm IS NULL AND p_out_pm IS NULL AND NOT v_pm_off
       AND v_in_pm_why IS NULL AND v_out_pm_why IS NULL THEN
      undertime_minutes := undertime_minutes + hris.half_day_undertime_minutes();
    END IF;
  END IF;

  -- Lateness: measured when there is an arrival to measure.
  IF NOT v_am_off AND v_in_am_why IS NULL AND w_in_am IS NOT NULL THEN
    late_minutes := GREATEST(0, ROUND(
      EXTRACT(EPOCH FROM (w_in_am - v_sched_in)) / 60.0)::INT);
  END IF;

  IF v_pm_off THEN
    RETURN;
  END IF;

  -- Early departure: measured when there is a departure to measure. A missing
  -- clock-out is unsettled and costs nothing.
  IF v_out_pm_why IS NULL AND w_out_pm IS NOT NULL THEN
    undertime_minutes := undertime_minutes + GREATEST(0, ROUND(
      EXTRACT(EPOCH FROM (v_sched_out - w_out_pm)) / 60.0)::INT);
  END IF;

  -- A late return from lunch is afternoon service not rendered.
  IF v_has_break AND v_in_pm_why IS NULL AND w_in_pm IS NOT NULL THEN
    -- The scheduled return from lunch, on the next calendar day when a
    -- midnight-crossing shift takes its break past midnight.
    IF v_crosses AND p_break_end < p_time_in THEN
      v_sched_bend := ((p_date + 1)::timestamp) + p_break_end;
    ELSE
      v_sched_bend := (p_date::timestamp) + p_break_end;
    END IF;
    undertime_minutes := undertime_minutes + GREATEST(0, ROUND(
      EXTRACT(EPOCH FROM (w_in_pm - v_sched_bend)) / 60.0)::INT);
  END IF;
END;
$$;

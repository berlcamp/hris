-- Migration 075: a weekend is charged nothing, even when it carries punches
--
-- Migration 073 stopped a Saturday or Sunday from being billed the FLAT charges
-- — the half day for an incomplete session, the eight hours for an absence —
-- but kept measuring the per-minute ones: a weekend session carrying both its
-- punches was still scored for lateness, early departure and a late return from
-- lunch, exactly as a Tuesday would be. That is the half of the rule this
-- migration removes.
--
-- The reasoning that dropped the flat charges applies just as well to the
-- per-minute ones. hris.schedules carries hours only — migrations 030 and 036
-- never gave it a day-of-week column — so nothing in this system can roster an
-- employee onto a Saturday. With no hours owed there is no schedule for a punch
-- to be measured AGAINST: arriving at 08:15 or leaving at 15:00 on a rest day is
-- not a shortfall against a duty that was never required, it is unrequired
-- service rendered short. Charging it billed employees for weekend work they
-- volunteered.
--
-- So: on a rest day, late_minutes and undertime_minutes are both zero,
-- whatever the punches say. The times still print on the DTR; only the
-- deduction is dropped. This mirrors dayLateUndertime in
-- src/lib/attendance-schedule.ts, which now returns zero for a rest day before
-- looking at a single slot.
--
-- Only hris.day_late_undertime changes. hris.compute_attendance_deduction_minutes
-- and the attendance_logs recompute trigger both delegate to it and inherit the
-- rule unchanged.
--
-- NOTE ON EXISTING FIGURES: this lowers the deduction for any month containing a
-- worked weekend that was being charged for lateness or an early departure. As
-- in migrations 072 and 073, posted ledger entries are not rewritten here;
-- hris.post_attendance_vl_deduction_for_employee posts the DELTA between the
-- computed requirement and what is already posted, so a month recomputed after
-- this migration self-corrects on its next run, crediting back the difference.

SET search_path TO hris, public, auth, extensions;

-- Signature unchanged from migrations 072/073, so no DROP is needed and every
-- existing call site keeps working.
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
  OUT late_minutes  INT,
  OUT undertime_minutes INT
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_crosses     BOOLEAN;
  v_has_break   BOOLEAN;
  v_day_excused BOOLEAN;
  v_am_off      BOOLEAN;
  v_pm_off      BOOLEAN;
  -- The stored punches as Manila wall clock (see the TIMEZONE note in 070).
  w_in_am       TIMESTAMP;
  w_out_am      TIMESTAMP;
  w_in_pm       TIMESTAMP;
  w_out_pm      TIMESTAMP;
  v_sched_in    TIMESTAMP;
  v_sched_out   TIMESTAMP;
  v_sched_bend  TIMESTAMP;
  v_am_complete BOOLEAN;
  v_pm_complete BOOLEAN;
  v_am_excused  BOOLEAN;
  v_pm_excused  BOOLEAN;
BEGIN
  late_minutes := 0;
  undertime_minutes := 0;

  -- A rest day owes no hours, so nothing is charged on it — not the flat half
  -- days, not lateness, not an early departure. Derived from the date rather
  -- than passed in: every caller scores the same calendar, and a caller that
  -- could forget the flag is a caller that would drift from the printed DTR.
  IF hris.is_rest_day(p_date) THEN
    RETURN;
  END IF;

  w_in_am  := p_in_am  AT TIME ZONE 'UTC';
  w_out_am := p_out_am AT TIME ZONE 'UTC';
  w_in_pm  := p_in_pm  AT TIME ZONE 'UTC';
  w_out_pm := p_out_pm AT TIME ZONE 'UTC';

  -- A day with NO punches at all is an ABSENCE, not two incomplete sessions.
  -- The absent flag carries it and the DTR charges the full eight hours there.
  -- Charging 4 + 4 here as well would turn every holiday and approved leave
  -- into an eight-hour undertime.
  IF w_in_am IS NULL AND w_out_am IS NULL
     AND w_in_pm IS NULL AND w_out_pm IS NULL THEN
    RETURN;
  END IF;

  v_crosses     := (p_time_out <= p_time_in);
  v_has_break   := (p_break_start IS NOT NULL AND p_break_end IS NOT NULL);
  v_day_excused := (p_no_time_reason IS NOT NULL);
  v_am_off      := v_day_excused OR COALESCE(p_excuse_am, FALSE);
  v_pm_off      := v_day_excused OR COALESCE(p_excuse_pm, FALSE);

  -- Scheduled in is always on the duty date. Scheduled out lands on the next
  -- calendar day when the shift crosses midnight.
  v_sched_in := (p_date::timestamp) + p_time_in;
  IF v_crosses THEN
    v_sched_out := ((p_date + 1)::timestamp) + p_time_out;
  ELSE
    v_sched_out := (p_date::timestamp) + p_time_out;
  END IF;

  ---------------------------------------------------------------------------
  -- No break: a single in/out pair has no half to charge, so a missing
  -- clock-out bills the whole shift.
  ---------------------------------------------------------------------------
  IF NOT v_has_break THEN
    IF NOT v_am_off AND p_reason_in_am IS NULL AND w_in_am IS NOT NULL THEN
      late_minutes := GREATEST(0, ROUND(
        EXTRACT(EPOCH FROM (w_in_am - v_sched_in)) / 60.0)::INT);
    END IF;

    IF v_pm_off OR p_reason_out_pm IS NOT NULL THEN
      undertime_minutes := 0;
    ELSIF w_out_pm IS NULL THEN
      -- Present but never clocked out: the whole shift is uncovered. The
      -- baseline is time_in ON THE DUTY DATE, matching undertimeMinutesFor.
      IF w_in_am IS NOT NULL THEN
        undertime_minutes := GREATEST(0, ROUND(
          EXTRACT(EPOCH FROM (v_sched_out - ((p_date::timestamp) + p_time_in)))
          / 60.0)::INT);
      END IF;
    ELSE
      undertime_minutes := GREATEST(0, ROUND(
        EXTRACT(EPOCH FROM (v_sched_out - w_out_pm)) / 60.0)::INT);
    END IF;

    RETURN;
  END IF;

  ---------------------------------------------------------------------------
  -- Has break: two sessions, each charged a flat half day when incomplete.
  ---------------------------------------------------------------------------
  -- The scheduled return from lunch, on the next calendar day when a
  -- midnight-crossing shift takes its break past midnight.
  IF v_crosses AND p_break_end < p_time_in THEN
    v_sched_bend := ((p_date + 1)::timestamp) + p_break_end;
  ELSE
    v_sched_bend := (p_date::timestamp) + p_break_end;
  END IF;

  v_am_complete := (w_in_am IS NOT NULL AND w_out_am IS NOT NULL);
  v_pm_complete := (w_in_pm IS NOT NULL AND w_out_pm IS NOT NULL);
  -- A reason on either of a session's slots explains the missing punch, so the
  -- flat charge does not apply. The punches that ARE there are still measured:
  -- tagging the two lunch slots NO BREAK on a day worked straight through does
  -- not also forgive arriving half an hour late.
  v_am_excused := v_am_off
    OR p_reason_in_am IS NOT NULL OR p_reason_out_am IS NOT NULL;
  v_pm_excused := v_pm_off
    OR p_reason_in_pm IS NOT NULL OR p_reason_out_pm IS NOT NULL;

  -- --- morning ---
  IF NOT v_am_complete AND NOT v_am_excused THEN
    undertime_minutes := undertime_minutes + hris.half_day_undertime_minutes();
  ELSIF NOT v_am_off AND p_reason_in_am IS NULL AND w_in_am IS NOT NULL THEN
    late_minutes := GREATEST(0, ROUND(
      EXTRACT(EPOCH FROM (w_in_am - v_sched_in)) / 60.0)::INT);
  END IF;

  -- --- afternoon ---
  IF NOT v_pm_complete AND NOT v_pm_excused THEN
    undertime_minutes := undertime_minutes + hris.half_day_undertime_minutes();
  ELSIF NOT v_pm_off THEN
    -- Early departure, measured only when there is a departure to measure.
    IF p_reason_out_pm IS NULL AND w_out_pm IS NOT NULL THEN
      undertime_minutes := undertime_minutes + GREATEST(0, ROUND(
        EXTRACT(EPOCH FROM (v_sched_out - w_out_pm)) / 60.0)::INT);
    END IF;
    -- A late return from lunch is afternoon service not rendered.
    IF p_reason_in_pm IS NULL AND w_in_pm IS NOT NULL THEN
      undertime_minutes := undertime_minutes + GREATEST(0, ROUND(
        EXTRACT(EPOCH FROM (w_in_pm - v_sched_bend)) / 60.0)::INT);
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION hris.day_late_undertime(
  DATE, TIME, TIME, TIME, TIME,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN
) TO authenticated, service_role;

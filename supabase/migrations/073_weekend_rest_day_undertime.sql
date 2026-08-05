-- Migration 073: a weekend owes no hours, so it is charged no undertime
--
-- The DTR printed SATURDAY across a weekend row's time columns while charging a
-- full 8-hour undertime in the cells beside it, and rolled those 480 minutes
-- into the page total and the leave-credit conversion. Two paths reached it:
--
--   * a blank weekend attendance_logs row carries is_absent = true — the flag
--     only ever meant "this row has no punches" — and the DTR bills an absence
--     eight hours;
--   * a weekend with a single stray scan reached 240 + 240 = 480 through the
--     half-day rule (migration 070) and was reclassified as an absence, which
--     also erased the punch from the printout.
--
-- hris.schedules carries hours only — migrations 030 and 036 never gave it a
-- day-of-week column — so nothing in this system can roster an employee onto a
-- Saturday. The weekend is therefore the one span the schedule model can say no
-- hours are owed on, and hris.attendance_logs has no notion of it at all.
--
-- The rule, mirroring dayLateUndertime in src/lib/attendance-schedule.ts:
--
--   On a rest day none of the FLAT charges apply. An incomplete session is not
--   a session unrendered — there is nothing for the half day to be charged
--   against — and a no-break shift with no clock-out does not bill the whole
--   shift. What CAN be measured is still measured: a session carrying both its
--   punches is scored for lateness, early departure and a late return from
--   lunch exactly as on a weekday, so an employee who does report for weekend
--   duty is held to the hours they actually recorded.
--
-- Only hris.day_late_undertime changes. hris.compute_attendance_deduction_minutes
-- calls it and inherits the rule unchanged, including its own 7h cap and the
-- 8h absence skip — which a rest day can now no longer reach.
--
-- NOTE ON EXISTING FIGURES: this lowers the deduction for any month containing
-- a weekend row that was being charged — a half-worked Saturday, or one with a
-- missed lunch scan, both of which billed 240 minutes. As in migration 072,
-- posted ledger entries are not rewritten here;
-- hris.post_attendance_vl_deduction_for_employee posts the DELTA between the
-- computed requirement and what is already posted, so a month recomputed after
-- this migration self-corrects on its next run, crediting back the difference.

SET search_path TO hris, public, auth, extensions;

-- Saturday and Sunday. The mirror of isRestDay in
-- src/lib/attendance-schedule.ts. IMMUTABLE so day_late_undertime — which is
-- itself IMMUTABLE — can call it.
CREATE OR REPLACE FUNCTION hris.is_rest_day(p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$ SELECT EXTRACT(ISODOW FROM p_date) IN (6, 7) $$;

GRANT EXECUTE ON FUNCTION hris.is_rest_day(DATE) TO authenticated, service_role;

-- Signature unchanged from migration 072, so no DROP is needed and every
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
  -- No hours are owed on this date, so no flat charge has anything to bill
  -- against. Derived from the date rather than passed in: every caller scores
  -- the same calendar, and a caller that could forget the flag is a caller
  -- that would drift from the printed DTR.
  v_rest_day    BOOLEAN;
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

  w_in_am  := p_in_am  AT TIME ZONE 'UTC';
  w_out_am := p_out_am AT TIME ZONE 'UTC';
  w_in_pm  := p_in_pm  AT TIME ZONE 'UTC';
  w_out_pm := p_out_pm AT TIME ZONE 'UTC';

  -- A day with NO punches at all is an ABSENCE, not two incomplete sessions.
  -- The absent flag carries it and the DTR charges the full eight hours there.
  -- Charging 4 + 4 here as well would turn every rest day, holiday and approved
  -- leave into an eight-hour undertime.
  IF w_in_am IS NULL AND w_out_am IS NULL
     AND w_in_pm IS NULL AND w_out_pm IS NULL THEN
    RETURN;
  END IF;

  v_crosses     := (p_time_out <= p_time_in);
  v_has_break   := (p_break_start IS NOT NULL AND p_break_end IS NOT NULL);
  v_day_excused := (p_no_time_reason IS NOT NULL);
  v_am_off      := v_day_excused OR COALESCE(p_excuse_am, FALSE);
  v_pm_off      := v_day_excused OR COALESCE(p_excuse_pm, FALSE);
  v_rest_day    := hris.is_rest_day(p_date);

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
  -- clock-out bills the whole shift — except on a rest day, where the shift
  -- was never owed. A recorded departure is still measured either way.
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
      IF w_in_am IS NOT NULL AND NOT v_rest_day THEN
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
  -- Has break: two sessions, each charged a flat half day when incomplete —
  -- but never on a rest day.
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
  -- not also forgive arriving half an hour late. A rest day suppresses the flat
  -- charge for the same reason a reason does — nothing was owed.
  v_am_excused := v_am_off OR v_rest_day
    OR p_reason_in_am IS NOT NULL OR p_reason_out_am IS NOT NULL;
  v_pm_excused := v_pm_off OR v_rest_day
    OR p_reason_in_pm IS NOT NULL OR p_reason_out_pm IS NOT NULL;

  -- --- morning ---
  -- On a rest day an INCOMPLETE morning is not measured either: with no
  -- departure there is no session to score, and charging its lateness alone
  -- would bill an employee for a weekend they were never rostered on. A weekday
  -- keeps measuring it — there the missing punch is explained by a reason, and
  -- an explained lunch scan must not also forgive arriving late.
  IF NOT v_am_complete AND NOT v_am_excused THEN
    undertime_minutes := undertime_minutes + hris.half_day_undertime_minutes();
  ELSIF NOT v_am_off AND p_reason_in_am IS NULL AND w_in_am IS NOT NULL
        AND (v_am_complete OR NOT v_rest_day) THEN
    late_minutes := GREATEST(0, ROUND(
      EXTRACT(EPOCH FROM (w_in_am - v_sched_in)) / 60.0)::INT);
  END IF;

  -- --- afternoon ---
  IF NOT v_pm_complete AND NOT v_pm_excused THEN
    undertime_minutes := undertime_minutes + hris.half_day_undertime_minutes();
  ELSIF NOT v_pm_off AND (v_pm_complete OR NOT v_rest_day) THEN
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

-- Migration 066: Transactional apply for an approved attendance correction.
--
-- The caller (approveAttendanceCorrection) computes each day's finished
-- attendance_logs row in TypeScript with buildCorrectionRecord, so the DTR math
-- lives in exactly one place — src/lib/attendance-schedule.ts — instead of being
-- reimplemented in SQL and drifting from it. This function's only jobs are the
-- drift check and committing every row together.
--
-- Returns 'needs_rebase' if ANY targeted row changed since its snapshot was
-- taken (a biometric import, an HR manual edit). Nothing is applied in that
-- case: a half-applied range is worse than none. The status change itself still
-- commits, so the requester sees the request come back to them.

SET search_path TO hris, public, auth, extensions;

CREATE OR REPLACE FUNCTION hris.apply_attendance_correction(
  p_request_id     UUID,
  p_reviewer_id    UUID,
  p_reviewer_email TEXT,
  p_rows           JSONB
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hris, public, extensions
AS $$
DECLARE
  v_row     JSONB;
  v_rec     JSONB;
  v_log_id  UUID;
  v_before  JSONB;
  v_drift   BOOLEAN := false;
BEGIN
  -- Pass 1: lock every targeted row and compare it against its snapshot.
  -- Casting the snapshot's text back to the native column type makes the
  -- comparison immune to timestamp formatting differences between PostgREST,
  -- the JS client and Postgres.
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_log_id := (v_row->>'attendance_log_id')::UUID;

    SELECT i.before INTO v_before
    FROM hris.attendance_correction_items i
    WHERE i.request_id = p_request_id AND i.attendance_log_id = v_log_id;

    IF v_before IS NULL THEN
      v_drift := true;
      EXIT;
    END IF;

    PERFORM 1
    FROM hris.attendance_logs l
    WHERE l.id = v_log_id
      AND l.time_in_am  IS NOT DISTINCT FROM NULLIF(v_before->>'time_in_am','')::TIMESTAMPTZ
      AND l.time_out_am IS NOT DISTINCT FROM NULLIF(v_before->>'time_out_am','')::TIMESTAMPTZ
      AND l.time_in_pm  IS NOT DISTINCT FROM NULLIF(v_before->>'time_in_pm','')::TIMESTAMPTZ
      AND l.time_out_pm IS NOT DISTINCT FROM NULLIF(v_before->>'time_out_pm','')::TIMESTAMPTZ
      AND l.schedule_id IS NOT DISTINCT FROM NULLIF(v_before->>'schedule_id','')::UUID
      AND l.source      IS NOT DISTINCT FROM NULLIF(v_before->>'source','')
    FOR UPDATE;

    IF NOT FOUND THEN
      v_drift := true;
      EXIT;
    END IF;
  END LOOP;

  IF v_drift THEN
    UPDATE hris.attendance_correction_requests
    SET status = 'needs_rebase', updated_at = now()
    WHERE id = p_request_id;
    RETURN 'needs_rebase';
  END IF;

  -- Pass 2: every row verified, write them all.
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_log_id := (v_row->>'attendance_log_id')::UUID;
    v_rec    := v_row->'record';

    UPDATE hris.attendance_logs SET
      schedule_id        = NULLIF(v_rec->>'schedule_id','')::UUID,
      time_in_am         = NULLIF(v_rec->>'time_in_am','')::TIMESTAMPTZ,
      time_out_am        = NULLIF(v_rec->>'time_out_am','')::TIMESTAMPTZ,
      time_in_pm         = NULLIF(v_rec->>'time_in_pm','')::TIMESTAMPTZ,
      time_out_pm        = NULLIF(v_rec->>'time_out_pm','')::TIMESTAMPTZ,
      time_in_am_reason  = NULLIF(v_rec->>'time_in_am_reason',''),
      time_out_am_reason = NULLIF(v_rec->>'time_out_am_reason',''),
      time_in_pm_reason  = NULLIF(v_rec->>'time_in_pm_reason',''),
      time_out_pm_reason = NULLIF(v_rec->>'time_out_pm_reason',''),
      is_late            = (v_rec->>'is_late')::BOOLEAN,
      late_minutes       = (v_rec->>'late_minutes')::INT,
      is_undertime       = (v_rec->>'is_undertime')::BOOLEAN,
      undertime_minutes  = (v_rec->>'undertime_minutes')::INT,
      is_absent          = (v_rec->>'is_absent')::BOOLEAN,
      source             = 'manual',
      correction_locked  = true,
      updated_by         = p_reviewer_id,
      updated_by_email   = p_reviewer_email,
      updated_at         = now()
    WHERE id = v_log_id;
  END LOOP;

  UPDATE hris.attendance_correction_requests
  SET status            = 'approved',
      reviewed_by       = p_reviewer_id,
      reviewed_by_email = p_reviewer_email,
      reviewed_at       = now(),
      applied_at        = now(),
      updated_at        = now()
  WHERE id = p_request_id;

  RETURN 'applied';
END;
$$;

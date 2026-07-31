-- Migration 067: SATURDAY / SUNDAY / LEAVE reasons, and corrections for a day
-- that has no attendance row yet.
--
-- Three parts:
--   1. Three new reason codes on all five attendance_logs reason columns and
--      all four correction-item proposal columns.
--   2. attendance_correction_items.attendance_log_id becomes NULLABLE, so a
--      request can cover a duty date with no attendance row at all — a weekend
--      the employee worked but the biometric never captured, which previously
--      could not be corrected because the workflow only ever UPDATEd.
--   3. apply_attendance_correction gains an INSERT path and a second drift
--      rule, and is re-keyed from attendance_log_id to duty_date.
--
-- Part 2 deliberately reverses migration 065's "an item can only exist for a
-- date that ALREADY has an attendance row". That invariant existed to stop the
-- workflow inventing days; the guard is now the requester having to pick the
-- date inside a range they justified with a document, plus the drift rule in
-- part 3 that refuses to insert if a row has appeared in the meantime.

SET search_path TO hris, public, auth, extensions;

-- 1. Reason codes ---------------------------------------------------------------
-- Same re-runnable DO-block pattern as migrations 053, 054 and 065: drop both
-- the auto-named inline CHECK and the previous named one, then re-add widened.

DO $$
DECLARE
  col TEXT;
  allowed CONSTANT TEXT :=
    '''travel'', ''field_work'', ''official_business'', ''holiday'', ''off'', '
    '''no_break'', ''saturday'', ''sunday'', ''leave''';
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
-- (migration 040), so a per-employee holiday declared by one department would
-- contradict that table. SATURDAY / SUNDAY / LEAVE carry no such conflict.
DO $$
DECLARE
  col TEXT;
  allowed CONSTANT TEXT :=
    '''travel'', ''field_work'', ''official_business'', ''off'', '
    '''no_break'', ''saturday'', ''sunday'', ''leave''';
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

-- 2. A correction item may now target a date with no attendance row ------------

ALTER TABLE hris.attendance_correction_items
  ALTER COLUMN attendance_log_id DROP NOT NULL;

COMMENT ON COLUMN hris.attendance_correction_items.attendance_log_id IS
  'NULL means this item CREATES the day: no attendance_logs row existed for '
  '(employee, duty_date) when the request was filed. apply_attendance_correction '
  'inserts one, and refuses (needs_rebase) if a row has appeared since. '
  'Non-NULL means the item updates that existing row, guarded by the `before` '
  'snapshot comparison.';

-- UNIQUE (request_id, duty_date) already exists from migration 065 and is what
-- the function keys on below — attendance_log_id can no longer serve as the
-- lookup key now that it is nullable and repeatable across items.

-- 3. Apply function -------------------------------------------------------------

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
  v_row      JSONB;
  v_rec      JSONB;
  v_duty     DATE;
  v_log_id   UUID;
  v_before   JSONB;
  v_employee UUID;
  v_drift    BOOLEAN := false;
BEGIN
  -- An empty (or missing) row set has nothing to verify or apply. Without this
  -- guard both loops below are no-ops and the request would be marked approved
  -- having written nothing.
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 'needs_rebase';
  END IF;

  -- The employee comes from the REQUEST, never from the caller-supplied record.
  -- The rows arrive as JSONB from a SECURITY DEFINER function's caller, so
  -- taking employee_id from them would let a malformed (or forged) record write
  -- an attendance row for somebody outside the request entirely.
  SELECT r.employee_id INTO v_employee
  FROM hris.attendance_correction_requests r
  WHERE r.id = p_request_id;
  IF v_employee IS NULL THEN
    RETURN 'needs_rebase';
  END IF;

  -- Pass 1: verify every targeted day, locking the rows that already exist.
  -- Keyed on duty_date, not attendance_log_id: the latter is nullable now and
  -- several items in one request can share NULL, so it no longer identifies a
  -- row. UNIQUE (request_id, duty_date) makes duty_date an exact key.
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_duty := (v_row->>'duty_date')::DATE;

    SELECT i.before, i.attendance_log_id INTO v_before, v_log_id
    FROM hris.attendance_correction_items i
    WHERE i.request_id = p_request_id AND i.duty_date = v_duty;

    IF NOT FOUND THEN
      v_drift := true;
      EXIT;
    END IF;

    IF v_log_id IS NULL THEN
      -- CREATE item. It was filed because the day had no attendance row. If one
      -- exists now — a biometric import landed, or somebody keyed it by hand —
      -- inserting would either collide or silently overwrite data nobody
      -- reviewed, so send the request back instead.
      PERFORM 1
      FROM hris.attendance_logs l
      WHERE l.employee_id = v_employee AND l.date = v_duty;

      IF FOUND THEN
        v_drift := true;
        EXIT;
      END IF;
    ELSE
      -- UPDATE item. Casting the snapshot's text back to the native column type
      -- makes the comparison immune to timestamp formatting differences between
      -- PostgREST, the JS client and Postgres.
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
    END IF;
  END LOOP;

  IF v_drift THEN
    UPDATE hris.attendance_correction_requests
    SET status = 'needs_rebase', updated_at = now()
    WHERE id = p_request_id;
    RETURN 'needs_rebase';
  END IF;

  -- Pass 2: every row verified, write them all.
  --
  -- Wrapped in ONE exception block, not one per row: a block establishes a
  -- savepoint, so a per-row block would roll back only the failing row and
  -- leave the earlier ones committed — a half-applied range, which is exactly
  -- what this function exists to prevent. At this scope a conflict discards
  -- every write in the pass.
  --
  -- The unique_violation being caught is a genuine race: pass 1 checked no row
  -- existed for a CREATE item, and a concurrent import can insert one between
  -- that check and this INSERT. UNIQUE (employee_id, date) is what catches it.
  BEGIN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
      v_duty := (v_row->>'duty_date')::DATE;
      v_rec  := v_row->'record';

      SELECT i.attendance_log_id INTO v_log_id
      FROM hris.attendance_correction_items i
      WHERE i.request_id = p_request_id AND i.duty_date = v_duty;

      IF v_log_id IS NULL THEN
        INSERT INTO hris.attendance_logs (
          employee_id, date, schedule_id,
          time_in_am, time_out_am, time_in_pm, time_out_pm,
          time_in_am_reason, time_out_am_reason,
          time_in_pm_reason, time_out_pm_reason,
          remarks, no_time_reason,
          is_late, late_minutes, is_undertime, undertime_minutes, is_absent,
          source, correction_locked,
          created_by, created_by_email, updated_by, updated_by_email, updated_at
        ) VALUES (
          v_employee,
          v_duty,
          NULLIF(v_rec->>'schedule_id','')::UUID,
          NULLIF(v_rec->>'time_in_am','')::TIMESTAMPTZ,
          NULLIF(v_rec->>'time_out_am','')::TIMESTAMPTZ,
          NULLIF(v_rec->>'time_in_pm','')::TIMESTAMPTZ,
          NULLIF(v_rec->>'time_out_pm','')::TIMESTAMPTZ,
          NULLIF(v_rec->>'time_in_am_reason',''),
          NULLIF(v_rec->>'time_out_am_reason',''),
          NULLIF(v_rec->>'time_in_pm_reason',''),
          NULLIF(v_rec->>'time_out_pm_reason',''),
          NULLIF(v_rec->>'remarks',''),
          NULLIF(v_rec->>'no_time_reason',''),
          (v_rec->>'is_late')::BOOLEAN,
          (v_rec->>'late_minutes')::INT,
          (v_rec->>'is_undertime')::BOOLEAN,
          (v_rec->>'undertime_minutes')::INT,
          (v_rec->>'is_absent')::BOOLEAN,
          'manual',
          true,
          p_reviewer_id, p_reviewer_email,
          p_reviewer_id, p_reviewer_email,
          now()
        );
      ELSE
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
          remarks            = NULLIF(v_rec->>'remarks',''),
          no_time_reason     = NULLIF(v_rec->>'no_time_reason',''),
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
      END IF;
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    UPDATE hris.attendance_correction_requests
    SET status = 'needs_rebase', updated_at = now()
    WHERE id = p_request_id;
    RETURN 'needs_rebase';
  END;

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

-- CREATE OR REPLACE preserves existing grants, but this migration must also be
-- correct applied to a database that never ran 066 — see the rationale there:
-- the function is SECURITY DEFINER and takes the reviewer identity as a
-- PARAMETER, so a default PUBLIC grant would let any authenticated caller
-- self-approve a correction with a forged reviewer.
REVOKE EXECUTE ON FUNCTION hris.apply_attendance_correction(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION hris.apply_attendance_correction(UUID, UUID, TEXT, JSONB) TO service_role;

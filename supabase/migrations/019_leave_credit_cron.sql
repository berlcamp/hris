-- Migration 019: pg_cron schedules for leave-credit automation.
--
-- Two daily jobs that *guard* themselves on the Asia/Manila calendar so
-- you don't have to think about UTC↔local edge cases:
--
--   * leave-accrual-monthly: fires daily; only acts on the 1st of the Manila
--     month, when it accrues VL/SL for the month *just ended*.
--   * leave-yearly-provision: fires daily; only acts on Jan 1 (Manila), when
--     it provisions carryover + seed rows for the new year.
--
-- pg_cron schedules are in UTC. We pick 16:05 UTC = 00:05 Asia/Manila.
-- (Manila is UTC+8, no DST.)
--
-- Both jobs are idempotent — re-running on the same day is a no-op.

SET search_path TO hris, public, auth, extensions;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Wrapper that fires monthly accrual on Manila day-1 ────────────────────

CREATE OR REPLACE FUNCTION hris.cron_run_monthly_accrual()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
DECLARE
  manila_today  DATE := (now() AT TIME ZONE 'Asia/Manila')::date;
  prev_month    DATE;
  result_row    RECORD;
BEGIN
  IF EXTRACT(DAY FROM manila_today)::INT <> 1 THEN
    RETURN 'skip: not the 1st of the Manila month (today=' || manila_today || ')';
  END IF;

  prev_month := manila_today - INTERVAL '1 day';

  SELECT * INTO result_row
    FROM hris.accrue_monthly_leave_credits(
      EXTRACT(YEAR  FROM prev_month)::INT,
      EXTRACT(MONTH FROM prev_month)::INT
    );

  RETURN format(
    'accrued %s for %s-%s: employees=%s inserted=%s skipped=%s',
    'VL/SL', result_row.year_v, lpad(result_row.month_v::text, 2, '0'),
    result_row.employees_count, result_row.rows_inserted, result_row.rows_skipped
  );
END
$$;

-- ── Wrapper that fires yearly provision on Manila Jan 1 ───────────────────

CREATE OR REPLACE FUNCTION hris.cron_run_yearly_provision()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
DECLARE
  manila_today DATE := (now() AT TIME ZONE 'Asia/Manila')::date;
  result_row   RECORD;
BEGIN
  IF to_char(manila_today, 'MM-DD') <> '01-01' THEN
    RETURN 'skip: not Jan 1 in Manila (today=' || manila_today || ')';
  END IF;

  SELECT * INTO result_row
    FROM hris.provision_year(EXTRACT(YEAR FROM manila_today)::INT);

  RETURN format(
    'provisioned %s: carryover=%s seeds=%s',
    EXTRACT(YEAR FROM manila_today)::INT,
    result_row.carryover_rows, result_row.seed_rows
  );
END
$$;

-- ── pg_cron schedules ─────────────────────────────────────────────────────
-- Unschedule any prior run with the same name so this migration is re-runnable.

DO $$
BEGIN
  PERFORM cron.unschedule('leave-accrual-monthly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'leave-accrual-monthly');
  PERFORM cron.unschedule('leave-yearly-provision')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'leave-yearly-provision');
EXCEPTION WHEN OTHERS THEN
  -- Some Supabase environments don't expose cron.unschedule(text) before a
  -- job exists; ignore.
  NULL;
END $$;

-- Daily 00:05 Asia/Manila (= 16:05 UTC) — accrue prior month if today is Manila day-1.
SELECT cron.schedule(
  'leave-accrual-monthly',
  '5 16 * * *',
  $$ SELECT hris.cron_run_monthly_accrual(); $$
);

-- Daily 00:10 Asia/Manila (= 16:10 UTC) — provision year if today is Manila Jan 1.
SELECT cron.schedule(
  'leave-yearly-provision',
  '10 16 * * *',
  $$ SELECT hris.cron_run_yearly_provision(); $$
);

COMMENT ON FUNCTION hris.cron_run_monthly_accrual()  IS 'pg_cron entrypoint — runs monthly accrual on Manila day-1; no-op otherwise.';
COMMENT ON FUNCTION hris.cron_run_yearly_provision() IS 'pg_cron entrypoint — runs yearly provision on Manila Jan 1; no-op otherwise.';

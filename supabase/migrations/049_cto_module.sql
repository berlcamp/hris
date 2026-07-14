-- Migration 049: Compensatory Time Off (CTO) module
-- Implements Compensatory Overtime Credits (COC) per CSC-DBM Joint Circular
-- No. 2, s. 2004:
--   * COC earned = OT hours x 1.0 (regular workday) or x 1.5 (rest day/holiday)
--   * max 40 hours COC earned per calendar month
--   * max 120 hours accumulated balance (excess forfeited, never stored)
--   * COC expires one (1) year from the date the overtime was rendered
--   * CTO availed in 4-hour blocks, max 5 consecutive working days (40h) per availment
--   * COC is non-convertible to cash and cannot offset tardiness/undertime
--
-- The DB stores facts only. The 40h/month and 120h caps, FIFO consumption of
-- earn entries by approved applications, and expiry are all enforced in
-- TypeScript (src/lib/cto-helpers.ts + src/lib/actions/cto-actions.ts),
-- mirroring the compute-on-read philosophy of the leave credits ledger.
-- Expiry needs no cron: expired remainders simply stop counting at read time.
-- Forfeiture on separation likewise needs no data change.
--
-- COC earn entries are append-only and soft-voidable (voided_at/by/reason);
-- edits are done by voiding and re-encoding, keeping the ledger auditable.
--
-- Grants: not needed here — migration 020 set default privileges for new
-- tables in the hris schema.

SET search_path TO hris, public, auth, extensions;

-- ── COC earn ledger ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.cto_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hris.employees(id) ON DELETE CASCADE,
  ot_date DATE NOT NULL,
  day_type TEXT NOT NULL CHECK (day_type IN ('regular', 'rest_day', 'holiday')),
  hours_worked NUMERIC(5,2) NOT NULL CHECK (hours_worked > 0),
  multiplier NUMERIC(3,2) NOT NULL CHECK (multiplier IN (1.0, 1.5)),
  -- Post-cap COC hours credited (may be less than hours_worked * multiplier
  -- when clamped by the 40h/month or 120h balance caps at entry time).
  hours_earned NUMERIC(6,2) NOT NULL CHECK (hours_earned > 0),
  expiry_date DATE GENERATED ALWAYS AS ((ot_date + INTERVAL '1 year')::date) STORED,
  office_order_no TEXT,
  notes TEXT,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES hris.user_profiles(id),
  void_reason TEXT,
  created_by UUID REFERENCES hris.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cto_credits_employee
  ON hris.cto_credits(employee_id, ot_date);

CREATE INDEX IF NOT EXISTS idx_cto_credits_expiry
  ON hris.cto_credits(expiry_date) WHERE voided_at IS NULL;

-- ── CTO applications (mirrors hris.leave_applications) ──────────────────
CREATE TABLE IF NOT EXISTS hris.cto_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hris.employees(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  -- The specific working days availed (weekends/full holidays excluded).
  cto_dates DATE[] NOT NULL,
  -- 4-hour blocks only; max 40h (5 days x 8h) per single availment.
  hours_applied NUMERIC(5,2) NOT NULL CHECK (
    hours_applied >= 4 AND hours_applied <= 40 AND MOD(hours_applied, 4) = 0
  ),
  reason TEXT,
  status hris.approval_status DEFAULT 'pending',
  department_head_id UUID REFERENCES hris.user_profiles(id),
  hr_reviewer_id UUID REFERENCES hris.user_profiles(id),
  dept_approved_at TIMESTAMPTZ,
  hr_approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by UUID REFERENCES hris.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cto_date_order CHECK (end_date >= start_date),
  CONSTRAINT cto_dates_max_5 CHECK (array_length(cto_dates, 1) BETWEEN 1 AND 5),
  -- Hours must fit the number of days: at most 8h/day, more than would fit
  -- in one fewer day (i.e. at most one half-day in the availment).
  CONSTRAINT cto_hours_fit_dates CHECK (
    hours_applied <= 8 * array_length(cto_dates, 1)
    AND hours_applied > 8 * (array_length(cto_dates, 1) - 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_cto_applications_employee
  ON hris.cto_applications(employee_id, start_date);

CREATE INDEX IF NOT EXISTS idx_cto_applications_status
  ON hris.cto_applications(status);

CREATE INDEX IF NOT EXISTS idx_cto_applications_created_by
  ON hris.cto_applications(created_by);

-- ── RLS (defense-in-depth; server actions use the admin client and
--    re-implement role filtering in TypeScript) ──────────────────────────
ALTER TABLE hris.cto_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.cto_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_all_cto_credits" ON hris.cto_credits
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_cto_credits" ON hris.cto_credits
  FOR SELECT USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_own_cto_credits" ON hris.cto_credits
  FOR SELECT USING (employee_id = hris.get_employee_id());

CREATE POLICY "hr_all_cto_applications" ON hris.cto_applications
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_cto_applications" ON hris.cto_applications
  FOR ALL USING (
    hris.get_user_role() IN ('department_head', 'department_admin_and_department_head')
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_create_cto" ON hris.cto_applications
  FOR INSERT WITH CHECK (employee_id = hris.get_employee_id());

CREATE POLICY "employee_view_own_cto" ON hris.cto_applications
  FOR SELECT USING (employee_id = hris.get_employee_id());

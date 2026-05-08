-- Migration 023: Payroll Module (Regular, COS, Job Order)
--
-- Adds three payroll variants from the LGU finance workflow:
--   * Regular plantilla payroll (1st/2nd half splits, full deduction set, PERA)
--   * COS (Contract of Service) payroll (5% EWT, optional 3% percentage tax)
--   * Job Order payroll (daily wage × days, plus overtime hours, SSS deductions)
--
-- All tables sit in the `hris` schema and reference `hris.employees(id)`.
-- JO-specific employee fields (daily rate, SSS amounts, ATM info, area) are
-- additive nullable columns on `hris.employees`, so plantilla/COS rows are
-- unaffected.

SET search_path TO hris, public, auth, extensions;

-- ============================================================================
-- JO-specific columns on employees
-- ============================================================================

ALTER TABLE hris.employees
  ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS sss_no VARCHAR(64),
  ADD COLUMN IF NOT EXISTS sss_ss NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS sss_ec NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(64),
  ADD COLUMN IF NOT EXISTS tin_number VARCHAR(64),
  ADD COLUMN IF NOT EXISTS has_atm BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS area_assigned VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sub_area VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_employees_area_assigned
  ON hris.employees(area_assigned);
CREATE INDEX IF NOT EXISTS idx_employees_sub_area
  ON hris.employees(sub_area);

-- ============================================================================
-- REGULAR (plantilla) PAYROLL
-- ============================================================================

CREATE TABLE hris.payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  particulars TEXT,
  particulars_2nd_half TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payroll_period_start ON hris.payroll(period_start DESC);

CREATE TRIGGER trg_payroll_updated_at BEFORE UPDATE ON hris.payroll
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

CREATE TABLE hris.employee_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id UUID NOT NULL REFERENCES hris.payroll(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hris.employees(id) ON DELETE CASCADE,
  designation TEXT,
  monthly_rate NUMERIC(12, 2),
  sif NUMERIC(12, 2),
  withholding_tax NUMERIC(12, 2),
  philhealth_personal_share NUMERIC(12, 2),
  philhealth_govt_share NUMERIC(12, 2),
  gsis_personal_share NUMERIC(12, 2),
  gsis_govt_share NUMERIC(12, 2),
  pag_ibig_personal_share NUMERIC(12, 2),
  pag_ibig_govt_share NUMERIC(12, 2),
  hmdf NUMERIC(12, 2),
  pag_ibig_salary_loan NUMERIC(12, 2),
  ss_contribution NUMERIC(12, 2),
  ss_contribution_ec NUMERIC(12, 2),
  gsis_repayments_mpl NUMERIC(12, 2),
  gsis_repayments_mpl_lite NUMERIC(12, 2),
  gsis_repayments_policy_loan NUMERIC(12, 2),
  gsis_repayments_cpl NUMERIC(12, 2),
  courage_2_contribution NUMERIC(12, 2),
  courage_salary_loan NUMERIC(12, 2),
  economic_enterprise_multipurpose_coop NUMERIC(12, 2),
  eempc_salary_loan NUMERIC(12, 2),
  emergency_loan NUMERIC(12, 2),
  notice_of_disallowance NUMERIC(12, 2),
  economic_enterprise_multipurpose_coop_pera NUMERIC(12, 2),
  courage_2_pera_loan NUMERIC(12, 2),
  amount_received NUMERIC(12, 2),
  amount_received_2nd_half NUMERIC(12, 2),
  lbp_savings_account_number VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_employee_payroll UNIQUE (payroll_id, employee_id)
);

CREATE INDEX idx_employee_payroll_payroll_id ON hris.employee_payroll(payroll_id);
CREATE INDEX idx_employee_payroll_employee_id ON hris.employee_payroll(employee_id);

CREATE TRIGGER trg_employee_payroll_updated_at BEFORE UPDATE ON hris.employee_payroll
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ============================================================================
-- COS (Contract of Service) PAYROLL
-- ============================================================================

CREATE TABLE hris.cos_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  particulars TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cos_payroll_period_start ON hris.cos_payroll(period_start DESC);

CREATE TRIGGER trg_cos_payroll_updated_at BEFORE UPDATE ON hris.cos_payroll
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

CREATE TABLE hris.cos_employee_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id UUID NOT NULL REFERENCES hris.cos_payroll(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hris.employees(id) ON DELETE CASCADE,
  designation TEXT,
  monthly_rate NUMERIC(12, 2),
  absent_without_pay NUMERIC(12, 2),
  ss_contribution NUMERIC(12, 2),
  ss_contribution_ec NUMERIC(12, 2),
  percentage_tax_3 NUMERIC(12, 2),
  amount_received NUMERIC(12, 2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_cos_employee_payroll UNIQUE (payroll_id, employee_id)
);

CREATE INDEX idx_cos_employee_payroll_payroll_id ON hris.cos_employee_payroll(payroll_id);
CREATE INDEX idx_cos_employee_payroll_employee_id ON hris.cos_employee_payroll(employee_id);

CREATE TRIGGER trg_cos_employee_payroll_updated_at BEFORE UPDATE ON hris.cos_employee_payroll
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ============================================================================
-- JO (Job Order) PAYROLL
-- ============================================================================

CREATE TABLE hris.jo_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  description TEXT,
  particulars TEXT,
  areas TEXT,
  days NUMERIC(5, 2),
  payroll_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_jo_payroll_period ON hris.jo_payroll(period_start DESC, period_end DESC);

CREATE TRIGGER trg_jo_payroll_updated_at BEFORE UPDATE ON hris.jo_payroll
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

CREATE TABLE hris.jo_payroll_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id UUID NOT NULL REFERENCES hris.jo_payroll(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hris.employees(id) ON DELETE CASCADE,
  days NUMERIC(5, 2),
  hours NUMERIC(5, 2),
  rate NUMERIC(10, 2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_jo_payroll_members UNIQUE (payroll_id, employee_id)
);

CREATE INDEX idx_jo_payroll_members_payroll ON hris.jo_payroll_members(payroll_id);
CREATE INDEX idx_jo_payroll_members_employee ON hris.jo_payroll_members(employee_id);

CREATE TRIGGER trg_jo_payroll_members_updated_at BEFORE UPDATE ON hris.jo_payroll_members
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ============================================================================
-- Grants for the service role (admin client) and authenticated users
-- ============================================================================

GRANT ALL ON hris.payroll, hris.employee_payroll,
            hris.cos_payroll, hris.cos_employee_payroll,
            hris.jo_payroll, hris.jo_payroll_members
  TO service_role;

GRANT SELECT ON hris.payroll, hris.employee_payroll,
                hris.cos_payroll, hris.cos_employee_payroll,
                hris.jo_payroll, hris.jo_payroll_members
  TO authenticated;

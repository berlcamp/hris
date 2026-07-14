-- ============================================================
-- RSP (Recruitment, Selection, Placement) module
-- Implements the CSC hiring pipeline for LGUs per the 2017 ORAOHRA
-- (CSC MC 24 s.2017, as amended) and RA 7041 publication rules:
--   recruitment  -> rsp_vacancies (publication of vacant plantilla items)
--   selection    -> rsp_applicants / rsp_applications / rsp_assessment_*
--   placement    -> rsp_appointments (CS Form 33-B lifecycle)
--
-- Enum strategy: real Postgres enums only for the CSC-fixed lists on
-- CS Form 33-B (nature and status of appointment). Workflow statuses use
-- TEXT + CHECK constraints so a future state change is a single constraint
-- swap on the live database instead of an ALTER TYPE.
-- ============================================================
SET search_path TO hris, public, auth, extensions;

CREATE TYPE hris.rsp_appointment_nature AS ENUM (
  'original', 'promotion', 'transfer', 'reemployment', 'reappointment',
  'reclassification', 'demotion', 'others'
);

CREATE TYPE hris.rsp_appointment_status_type AS ENUM (
  'permanent', 'temporary', 'coterminous', 'casual', 'contractual',
  'substitute', 'provisional'
);

-- ============================================================
-- rsp_vacancies — one vacancy = one plantilla item.
-- Position and QS fields are snapshots copied from plantilla at creation
-- (editable) so later plantilla edits don't rewrite recruitment history.
-- "Expired" (today past publication_expiry_date, not filled) is derived at
-- read time, never stored.
-- ============================================================
CREATE TABLE hris.rsp_vacancies (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_id              UUID NOT NULL REFERENCES hris.plantilla(id) ON DELETE RESTRICT,

  -- Position snapshot
  item_number               TEXT NOT NULL,
  position_title            TEXT NOT NULL,
  organizational_unit       TEXT,
  place_of_assignment       TEXT,
  salary_grade              INT,
  monthly_salary            NUMERIC(12,2),

  -- Qualification Standards (CSC QS manual)
  qs_education              TEXT,
  qs_training               TEXT,
  qs_training_hours         INT,
  qs_experience             TEXT,
  qs_experience_years       NUMERIC(4,1),
  qs_eligibility            TEXT,

  -- Publication (RA 7041 / CSC Bulletin of Vacant Positions)
  publication_date          DATE,
  closing_date              DATE,
  csc_bulletin_no           TEXT,
  publication_expiry_date   DATE,   -- publication_date + 9 months, stamped on publish
  hrmpsb_deliberation_date  DATE,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'closed', 'filled', 'cancelled')),
  remarks     TEXT,
  created_by  UUID REFERENCES hris.user_profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),

  -- RA 7041: posting period of at least 10 calendar days, counted inclusively
  CONSTRAINT chk_rsp_vacancy_posting_period CHECK (
    publication_date IS NULL OR closing_date IS NULL
    OR closing_date >= publication_date + 9
  )
);

-- Only one live recruitment per plantilla item (refill later is allowed)
CREATE UNIQUE INDEX uq_rsp_vacancies_active_item
  ON hris.rsp_vacancies(plantilla_id)
  WHERE status IN ('draft', 'published', 'closed');
CREATE INDEX idx_rsp_vacancies_status    ON hris.rsp_vacancies(status);
CREATE INDEX idx_rsp_vacancies_plantilla ON hris.rsp_vacancies(plantilla_id);

-- ============================================================
-- rsp_applicants — reusable person records (PII)
-- ============================================================
CREATE TABLE hris.rsp_applicants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_name      TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  middle_name    TEXT,
  name_extension TEXT,
  sex            TEXT CHECK (sex IN ('male', 'female')),
  birth_date     DATE,
  address        TEXT,
  email          TEXT,
  mobile_no      TEXT,
  -- internal candidates (promotion/transfer) can link to an employee
  employee_id    UUID REFERENCES hris.employees(id) ON DELETE SET NULL,
  notes          TEXT,
  created_by     UUID REFERENCES hris.user_profiles(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Non-unique dedup hint: the app warns on a match but never blocks
CREATE INDEX idx_rsp_applicants_name
  ON hris.rsp_applicants (lower(last_name), lower(first_name), birth_date);

-- ============================================================
-- rsp_applications — applicant x vacancy. Credential fields are a snapshot
-- of the applicant's qualifications as of application, screened against the
-- vacancy's QS.
-- ============================================================
CREATE TABLE hris.rsp_applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id       UUID NOT NULL REFERENCES hris.rsp_vacancies(id) ON DELETE CASCADE,
  applicant_id     UUID NOT NULL REFERENCES hris.rsp_applicants(id) ON DELETE RESTRICT,
  date_received    DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Applicant credential snapshot (mirrors the vacancy QS fields)
  education        TEXT,
  training         TEXT,
  training_hours   INT,
  experience       TEXT,
  experience_years NUMERIC(4,1),
  eligibility      TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'qualified', 'disqualified', 'withdrawn', 'selected')),
  screened_by       UUID REFERENCES hris.user_profiles(id),
  screened_at       TIMESTAMPTZ,
  screening_remarks TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE (vacancy_id, applicant_id)
);

-- At most one selected candidate per vacancy (race-safe)
CREATE UNIQUE INDEX uq_rsp_applications_selected
  ON hris.rsp_applications(vacancy_id) WHERE status = 'selected';
CREATE INDEX idx_rsp_applications_vacancy   ON hris.rsp_applications(vacancy_id);
CREATE INDEX idx_rsp_applications_applicant ON hris.rsp_applications(applicant_id);

-- ============================================================
-- rsp_assessment_criteria — per-vacancy HRMPSB comparative assessment
-- criteria; seeded with app defaults at vacancy creation, editable.
-- ============================================================
CREATE TABLE hris.rsp_assessment_criteria (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id UUID NOT NULL REFERENCES hris.rsp_vacancies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  weight     NUMERIC(5,2) NOT NULL CHECK (weight > 0 AND weight <= 100),
  max_score  NUMERIC(6,2) NOT NULL DEFAULT 100 CHECK (max_score > 0),
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (vacancy_id, name)
);
CREATE INDEX idx_rsp_criteria_vacancy ON hris.rsp_assessment_criteria(vacancy_id);

-- ============================================================
-- rsp_assessment_scores — consolidated HRMPSB score per criterion
-- ============================================================
CREATE TABLE hris.rsp_assessment_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES hris.rsp_applications(id) ON DELETE CASCADE,
  criterion_id   UUID NOT NULL REFERENCES hris.rsp_assessment_criteria(id) ON DELETE CASCADE,
  score          NUMERIC(6,2) NOT NULL CHECK (score >= 0),
  remarks        TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (application_id, criterion_id)
);
CREATE INDEX idx_rsp_scores_application ON hris.rsp_assessment_scores(application_id);

-- ============================================================
-- rsp_appointments — appointment lifecycle per CS Form 33-B.
-- Manual handoff by design: no hris.employees row creation and no
-- plantilla auto-update happens here.
-- ============================================================
CREATE TABLE hris.rsp_appointments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id     UUID NOT NULL REFERENCES hris.rsp_vacancies(id) ON DELETE RESTRICT,
  application_id UUID NOT NULL UNIQUE REFERENCES hris.rsp_applications(id) ON DELETE RESTRICT,
  plantilla_id   UUID NOT NULL REFERENCES hris.plantilla(id) ON DELETE RESTRICT,

  nature         hris.rsp_appointment_nature NOT NULL,
  nature_others  TEXT,   -- required by the app when nature = 'others'
  status_type    hris.rsp_appointment_status_type NOT NULL,
  item_number    TEXT,
  vice           TEXT,   -- whom replaced ("vice <name>, who <reason>")

  -- Lifecycle dates
  date_of_signing        DATE NOT NULL,
  oath_date              DATE,   -- CS Form 32 (Panunumpa sa Katungkulan)
  assumption_date        DATE,
  probation_end_date     DATE,   -- 6 months from assumption for original-permanent
  employment_period_from DATE,   -- for casual/contractual/temporary
  employment_period_to   DATE,

  appointing_authority          TEXT,
  appointing_authority_position TEXT,

  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'disapproved', 'recalled', 'cancelled')),
  remarks     TEXT,
  created_by  UUID REFERENCES hris.user_profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- One live appointment per vacancy (reissue possible after disapproval/recall)
CREATE UNIQUE INDEX uq_rsp_appointments_active_vacancy
  ON hris.rsp_appointments(vacancy_id) WHERE status = 'issued';

-- ============================================================
-- RLS — applicant PII: super_admin / hr_admin only. No dept-head or
-- employee policies and no anon grants, unlike plantilla.
-- ============================================================
ALTER TABLE hris.rsp_vacancies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.rsp_applicants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.rsp_applications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.rsp_assessment_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.rsp_assessment_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.rsp_appointments        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_rsp_vacancies" ON hris.rsp_vacancies
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "admin_all_rsp_applicants" ON hris.rsp_applicants
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "admin_all_rsp_applications" ON hris.rsp_applications
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "admin_all_rsp_assessment_criteria" ON hris.rsp_assessment_criteria
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "admin_all_rsp_assessment_scores" ON hris.rsp_assessment_scores
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "admin_all_rsp_appointments" ON hris.rsp_appointments
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

-- ============================================================
-- Grants (migration 007 only covered pre-existing tables).
-- Deliberately no anon grants: recruitment data is PII.
-- ============================================================
GRANT ALL ON hris.rsp_vacancies           TO authenticated, service_role;
GRANT ALL ON hris.rsp_applicants          TO authenticated, service_role;
GRANT ALL ON hris.rsp_applications        TO authenticated, service_role;
GRANT ALL ON hris.rsp_assessment_criteria TO authenticated, service_role;
GRANT ALL ON hris.rsp_assessment_scores   TO authenticated, service_role;
GRANT ALL ON hris.rsp_appointments        TO authenticated, service_role;

-- Reload PostgREST schema cache so the new tables and FKs are picked up
NOTIFY pgrst, 'reload schema';

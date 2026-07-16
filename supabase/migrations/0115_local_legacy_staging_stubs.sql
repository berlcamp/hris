-- Migration 0115: Legacy staging table stubs (local/dev bootstrap)
--
-- Runs between 011 and 012 (lexicographic: "011" < "0115" < "012").
--
-- WHY THIS EXISTS
-- ---------------
-- Migrations 012, 013 and 048 import from four staging tables that live in the
-- `public` schema and were populated OUT OF BAND by the old system:
--
--   public.adm_employees
--   public.hr_service_records
--   public.hr_service_records_activity_log
--   public.hr_plantilla
--
-- No migration ever created them, so they exist in production only. A local
-- `supabase db reset` therefore died at 012 with
-- `relation "public.adm_employees" does not exist`, which made the whole
-- local stack unusable for testing.
--
-- Every column here is TEXT wherever 012/013/048 pipe the value through
-- trim() / regexp_replace() / hris.safe_to_date() / hris.safe_to_int(), which
-- is how we know the legacy column was TEXT.
--
-- This file creates them EMPTY if and only if they are absent, so:
--   * locally  -> the tables exist, are empty, and 012/048 import zero rows
--                 and become no-ops. `db reset` completes.
--   * in prod  -> the tables already exist and are populated, so every
--                 CREATE TABLE IF NOT EXISTS is skipped and this migration
--                 changes NOTHING. It is safe but pointless to apply there.
--
-- Column types are intentionally permissive (TEXT for anything 012 pushes
-- through hris.safe_to_date / safe_to_int) and mirror only the columns that
-- 012 and 048 actually reference. This is a test scaffold, not a
-- reconstruction of the legacy schema.

SET search_path TO hris, public, auth, extensions;

CREATE TABLE IF NOT EXISTS public.adm_employees (
  id                        BIGINT PRIMARY KEY,
  firstname                 TEXT,
  middlename                TEXT,
  lastname                  TEXT,
  suffix                    TEXT,
  id_number                 TEXT,
  birthday                  TEXT,
  gender                    TEXT,
  department                TEXT,
  designation               TEXT,
  item_number               TEXT,
  old_item_number           TEXT,
  office_code               TEXT,
  office_assignment         TEXT,
  position_level            TEXT,
  salary_grade              TEXT,
  monthly_salary            NUMERIC,
  original_appointment      TEXT,
  transfer_date             TEXT,
  promotion_date            TEXT,
  sss_number                TEXT,
  status                    TEXT,
  employee_status           TEXT,
  inactive_reason           TEXT,
  inactive_effectivity_date DATE,
  type                      TEXT
);

CREATE TABLE IF NOT EXISTS public.hr_service_records (
  id                           BIGINT PRIMARY KEY,
  legacy_id                    BIGINT,
  employee_id                  BIGINT,
  date_from                    DATE,
  date_to                      DATE,
  designation                  TEXT,
  status                       TEXT,
  salary                       NUMERIC,
  daily_salary                 NUMERIC,
  sg                           TEXT,
  step                         TEXT,
  agency                       TEXT,
  office_department            TEXT,
  separation                   TEXT,
  leave_of_absence_without_pay TEXT,
  remarks                      TEXT,
  created_at                   TIMESTAMPTZ,
  updated_at                   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.hr_service_records_activity_log (
  id                BIGINT PRIMARY KEY,
  service_record_id BIGINT,
  user_id           BIGINT,
  action            TEXT,
  description       TEXT,
  created_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.hr_plantilla (
  id                                 BIGINT PRIMARY KEY,
  employee_id                        BIGINT,
  item_number                        TEXT,
  position_title                     TEXT,
  organizational_unit                TEXT,
  salary_grade                       TEXT,
  step                               TEXT,
  authorized_annual_salary           TEXT,
  actual_annual_salary               TEXT,
  area_code                          TEXT,
  area_type                          TEXT,
  level                              TEXT,
  level_supplemental                 TEXT,
  date_of_original_appointment       DATE,
  date_of_last_promotion_appointment DATE,
  status                             TEXT,
  is_vacant                          BOOLEAN,
  is_funded                          BOOLEAN,
  vice                               TEXT,
  civil_service_eligibility          TEXT,
  comment_annotation                 TEXT,
  gsis_bp_number                     TEXT,
  tin                                TEXT,
  pwd                                TEXT,
  indigenous_people                  TEXT,
  solo_parent                        TEXT,
  last_name                          TEXT,
  first_name                         TEXT,
  middle_name                        TEXT
);

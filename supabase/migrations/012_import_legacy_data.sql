-- Migration 012: One-shot import of legacy adm_employees + hr_service_records
-- Idempotent: re-running picks up new legacy rows but does not overwrite
-- existing migrated records (uses ON CONFLICT (legacy_id) DO NOTHING).
--
-- Source tables (already populated in public schema):
--   public.adm_employees
--   public.hr_service_records
--   public.hr_service_records_activity_log

SET search_path TO hris, public;

-- ── Helper: safe text→date cast ──────────────────────────────────────
-- Returns NULL when text is empty or unparseable instead of aborting the import.
-- Tries common date formats used by the old system.
CREATE OR REPLACE FUNCTION hris.safe_to_date(txt TEXT)
RETURNS DATE LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  trimmed TEXT;
  fmt TEXT;
  result DATE;
BEGIN
  IF txt IS NULL THEN RETURN NULL; END IF;
  trimmed := nullif(trim(txt), '');
  IF trimmed IS NULL THEN RETURN NULL; END IF;

  FOREACH fmt IN ARRAY ARRAY[
    'YYYY-MM-DD',
    'MM/DD/YYYY',
    'DD/MM/YYYY',
    'Mon DD, YYYY',
    'Month DD, YYYY',
    'YYYY/MM/DD'
  ] LOOP
    BEGIN
      result := to_date(trimmed, fmt);
      RETURN result;
    EXCEPTION WHEN OTHERS THEN
      -- try next format
    END;
  END LOOP;

  RETURN NULL;
END;
$$;

-- ── Helper: safe text→int cast ───────────────────────────────────────
CREATE OR REPLACE FUNCTION hris.safe_to_int(txt TEXT)
RETURNS INT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  trimmed TEXT;
BEGIN
  IF txt IS NULL THEN RETURN NULL; END IF;
  trimmed := nullif(regexp_replace(trim(txt), '[^0-9-]', '', 'g'), '');
  IF trimmed IS NULL OR trimmed = '-' THEN RETURN NULL; END IF;
  RETURN trimmed::INT;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ── Helper: safe text→numeric cast ───────────────────────────────────
CREATE OR REPLACE FUNCTION hris.safe_to_numeric(txt TEXT)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  trimmed TEXT;
BEGIN
  IF txt IS NULL THEN RETURN NULL; END IF;
  trimmed := nullif(regexp_replace(trim(txt), '[^0-9.-]', '', 'g'), '');
  IF trimmed IS NULL OR trimmed = '-' THEN RETURN NULL; END IF;
  RETURN trimmed::NUMERIC;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ── Helper: map legacy employment type text → enum ───────────────────
CREATE OR REPLACE FUNCTION hris.map_employment_type(txt TEXT)
RETURNS hris.employment_type LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(txt, ''))
    WHEN 'plantilla' THEN 'plantilla'::hris.employment_type
    WHEN 'permanent' THEN 'plantilla'::hris.employment_type
    WHEN 'casual'    THEN 'plantilla'::hris.employment_type
    WHEN 'jo'        THEN 'jo'::hris.employment_type
    WHEN 'job order' THEN 'jo'::hris.employment_type
    WHEN 'cos'       THEN 'cos'::hris.employment_type
    WHEN 'contract of service' THEN 'cos'::hris.employment_type
    ELSE 'plantilla'::hris.employment_type
  END;
$$;

-- ── Helper: map legacy status text → enum ────────────────────────────
CREATE OR REPLACE FUNCTION hris.map_employee_status(txt TEXT, inactive_eff DATE)
RETURNS hris.employee_status LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN inactive_eff IS NOT NULL THEN 'inactive'::hris.employee_status
    WHEN lower(coalesce(txt, '')) = 'active'     THEN 'active'::hris.employee_status
    WHEN lower(coalesce(txt, '')) = 'inactive'   THEN 'inactive'::hris.employee_status
    WHEN lower(coalesce(txt, '')) = 'retired'    THEN 'retired'::hris.employee_status
    WHEN lower(coalesce(txt, '')) = 'terminated' THEN 'terminated'::hris.employee_status
    WHEN lower(coalesce(txt, '')) = 'resigned'   THEN 'resigned'::hris.employee_status
    ELSE 'active'::hris.employee_status
  END;
$$;

-- ── Step 1: departments (auto-create from distinct legacy values) ───
INSERT INTO hris.departments (name, code)
SELECT DISTINCT
  trim(department) AS name,
  trim(department) AS code
FROM public.adm_employees
WHERE department IS NOT NULL
  AND trim(department) <> ''
ON CONFLICT (name) DO NOTHING;

-- ── Step 2: positions (auto-create from distinct designation+item) ──
INSERT INTO hris.positions (title, item_number, salary_grade, department_id)
SELECT DISTINCT ON (trim(ae.designation), trim(ae.item_number))
  trim(ae.designation) AS title,
  trim(ae.item_number) AS item_number,
  COALESCE(hris.safe_to_int(ae.salary_grade), 1) AS salary_grade,
  d.id AS department_id
FROM public.adm_employees ae
LEFT JOIN hris.departments d ON d.name = trim(ae.department)
WHERE ae.designation IS NOT NULL
  AND trim(ae.designation) <> ''
  AND ae.item_number IS NOT NULL
  AND trim(ae.item_number) <> ''
ON CONFLICT (item_number) DO NOTHING;

-- ── Step 3: employees ───────────────────────────────────────────────
INSERT INTO hris.employees (
  legacy_id,
  employee_no,
  id_number,
  first_name,
  middle_name,
  last_name,
  suffix,
  birth_date,
  gender,
  employment_type,
  position_id,
  department_id,
  salary_grade,
  step_increment,
  hire_date,
  status,
  item_number,
  old_item_number,
  office_code,
  office_assignment,
  position_level,
  original_appointment,
  transfer_date,
  promotion_date,
  sss_number,
  monthly_salary,
  inactive_reason,
  inactive_effectivity_date,
  legacy_status
)
SELECT
  ae.id AS legacy_id,
  -- employee_no is reserved for biometric-device use. Do NOT copy the legacy
  -- id_number here — that value lives in the id_number column for reference.
  -- We generate a simple unique numeric string from the legacy bigint id.
  ae.id::text AS employee_no,
  NULLIF(trim(ae.id_number), '') AS id_number,
  COALESCE(NULLIF(trim(ae.firstname), ''), 'Unknown') AS first_name,
  NULLIF(trim(ae.middlename), '') AS middle_name,
  COALESCE(NULLIF(trim(ae.lastname), ''), 'Unknown') AS last_name,
  NULLIF(trim(ae.suffix), '') AS suffix,
  hris.safe_to_date(ae.birthday) AS birth_date,
  NULLIF(trim(ae.gender), '') AS gender,
  hris.map_employment_type(ae.type) AS employment_type,
  p.id AS position_id,
  d.id AS department_id,
  COALESCE(hris.safe_to_int(ae.salary_grade), 1) AS salary_grade,
  1 AS step_increment,
  COALESCE(
    hris.safe_to_date(ae.original_appointment),
    (SELECT MIN(sr.date_from) FROM public.hr_service_records sr WHERE sr.employee_id = ae.id),
    CURRENT_DATE
  ) AS hire_date,
  hris.map_employee_status(
    COALESCE(NULLIF(trim(ae.employee_status), ''), ae.status),
    ae.inactive_effectivity_date
  ) AS status,
  NULLIF(trim(ae.item_number), '') AS item_number,
  NULLIF(trim(ae.old_item_number), '') AS old_item_number,
  NULLIF(trim(ae.office_code), '') AS office_code,
  NULLIF(trim(ae.office_assignment), '') AS office_assignment,
  NULLIF(trim(ae.position_level), '') AS position_level,
  hris.safe_to_date(ae.original_appointment) AS original_appointment,
  hris.safe_to_date(ae.transfer_date) AS transfer_date,
  hris.safe_to_date(ae.promotion_date) AS promotion_date,
  NULLIF(trim(ae.sss_number), '') AS sss_number,
  ae.monthly_salary,
  NULLIF(trim(ae.inactive_reason), '') AS inactive_reason,
  ae.inactive_effectivity_date,
  COALESCE(NULLIF(trim(ae.employee_status), ''), NULLIF(trim(ae.status), '')) AS legacy_status
FROM public.adm_employees ae
LEFT JOIN hris.departments d ON d.name = trim(ae.department)
LEFT JOIN hris.positions  p ON p.item_number = trim(ae.item_number)
ON CONFLICT (legacy_id) DO NOTHING;

-- ── Step 4: service_records ─────────────────────────────────────────
INSERT INTO hris.service_records (
  legacy_id,
  employee_id,
  date_from,
  date_to,
  designation,
  status_type,
  salary,
  office,
  agency,
  leave_without_pay,
  separation_cause,
  remarks,
  salary_grade,
  step_increment,
  daily_salary,
  created_at,
  updated_at
)
SELECT
  sr.id AS legacy_id,
  e.id AS employee_id,
  sr.date_from,
  sr.date_to,
  COALESCE(NULLIF(trim(sr.designation), ''), 'Unspecified') AS designation,
  NULLIF(trim(sr.status), '') AS status_type,
  sr.salary,
  NULLIF(trim(sr.office_department), '') AS office,
  NULLIF(trim(sr.agency), '') AS agency,
  COALESCE(hris.safe_to_int(sr.leave_of_absence_without_pay), 0) AS leave_without_pay,
  NULLIF(trim(sr.separation), '') AS separation_cause,
  NULLIF(trim(sr.remarks), '') AS remarks,
  hris.safe_to_int(sr.sg) AS salary_grade,
  hris.safe_to_int(sr.step) AS step_increment,
  sr.daily_salary,
  COALESCE(sr.created_at, now()) AS created_at,
  COALESCE(sr.updated_at, sr.created_at, now()) AS updated_at
FROM public.hr_service_records sr
JOIN hris.employees e ON e.legacy_id = sr.employee_id
WHERE sr.date_from IS NOT NULL
ON CONFLICT (legacy_id) DO NOTHING;

-- ── Step 5: activity log (best-effort; user_id stored in description) ──
-- The legacy adm_users.id (bigint) does not map to hris.user_profiles.id
-- (uuid). We preserve the original user reference inside the description
-- so provenance is not lost; user_id stays NULL.
INSERT INTO hris.service_records_activity_log (
  service_record_id,
  user_id,
  action,
  description,
  created_at
)
SELECT
  sr.id AS service_record_id,
  NULL::uuid AS user_id,
  log.action AS action,
  COALESCE(log.description, '') ||
    CASE WHEN log.user_id IS NOT NULL
         THEN ' (legacy user_id=' || log.user_id || ')'
         ELSE ''
    END AS description,
  COALESCE(log.created_at, now()) AS created_at
FROM public.hr_service_records_activity_log log
JOIN hris.service_records sr ON sr.legacy_id = log.service_record_id
WHERE log.action IN ('created', 'updated');

-- ── Verification: print counts ──────────────────────────────────────
DO $$
DECLARE
  src_emp INT;
  dst_emp INT;
  src_sr  INT;
  dst_sr  INT;
BEGIN
  SELECT count(*) INTO src_emp FROM public.adm_employees;
  SELECT count(*) INTO dst_emp FROM hris.employees WHERE legacy_id IS NOT NULL;
  SELECT count(*) INTO src_sr  FROM public.hr_service_records;
  SELECT count(*) INTO dst_sr  FROM hris.service_records WHERE legacy_id IS NOT NULL;
  RAISE NOTICE 'Legacy import: employees %/%, service_records %/%',
    dst_emp, src_emp, dst_sr, src_sr;
END $$;

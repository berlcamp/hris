-- ============================================================
-- hris.plantilla — migrated from public.hr_plantilla
-- Stores official CSC plantilla records linked to hris.employees.
-- date_of_original_appointment and date_of_last_promotion_appointment
-- are used as the basis date for NOSI step-increment eligibility.
-- ============================================================

CREATE TABLE hris.plantilla (
  id                                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                         UUID REFERENCES hris.employees(id) ON DELETE SET NULL,
  legacy_plantilla_id                 BIGINT UNIQUE,  -- public.hr_plantilla.id

  -- Position fields
  item_number                         TEXT,
  position_title                      TEXT,
  organizational_unit                 TEXT,
  salary_grade                        INT,
  step                                INT,
  authorized_annual_salary            NUMERIC(14,2),
  actual_annual_salary                NUMERIC(14,2),
  area_code                           TEXT,
  area_type                           TEXT,
  level                               TEXT,
  level_supplemental                  TEXT,

  -- NOSI basis dates
  date_of_original_appointment        DATE,
  date_of_last_promotion_appointment  DATE,

  -- Status / flags
  status                              TEXT,
  is_vacant                           BOOLEAN DEFAULT false,
  is_funded                           BOOLEAN DEFAULT true,
  vice                                TEXT,

  -- Supplemental
  civil_service_eligibility           TEXT,
  comment_annotation                  TEXT,
  gsis_bp_number                      TEXT,
  tin                                 TEXT,
  pwd                                 TEXT,
  indigenous_people                   TEXT,
  solo_parent                         TEXT,

  -- Reference personal data (kept for vacant rows with no employee link)
  ref_last_name                       TEXT,
  ref_first_name                      TEXT,
  ref_middle_name                     TEXT,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plantilla_employee_id ON hris.plantilla(employee_id);
CREATE INDEX idx_plantilla_item_number  ON hris.plantilla(item_number);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE hris.plantilla ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_plantilla" ON hris.plantilla
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_plantilla" ON hris.plantilla
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_own_plantilla" ON hris.plantilla
  FOR SELECT USING (employee_id = hris.get_employee_id());

-- ============================================================
-- One-shot migration from public.hr_plantilla
-- Links to hris.employees via hris.employees.legacy_id = hr_plantilla.employee_id
-- Safely casts TEXT salary_grade / step / salary columns.
-- ============================================================
INSERT INTO hris.plantilla (
  employee_id,
  legacy_plantilla_id,
  item_number,
  position_title,
  organizational_unit,
  salary_grade,
  step,
  authorized_annual_salary,
  actual_annual_salary,
  area_code,
  area_type,
  level,
  level_supplemental,
  date_of_original_appointment,
  date_of_last_promotion_appointment,
  status,
  is_vacant,
  is_funded,
  vice,
  civil_service_eligibility,
  comment_annotation,
  gsis_bp_number,
  tin,
  pwd,
  indigenous_people,
  solo_parent,
  ref_last_name,
  ref_first_name,
  ref_middle_name
)
SELECT
  e.id,
  hp.id,
  hp.item_number,
  hp.position_title,
  hp.organizational_unit,
  NULLIF(trim(hp.salary_grade), '')::INT,
  NULLIF(trim(hp.step), '')::INT,
  NULLIF(regexp_replace(COALESCE(hp.authorized_annual_salary, ''), '[^0-9.]', '', 'g'), '')::NUMERIC,
  NULLIF(regexp_replace(COALESCE(hp.actual_annual_salary,     ''), '[^0-9.]', '', 'g'), '')::NUMERIC,
  hp.area_code,
  hp.area_type,
  hp.level,
  hp.level_supplemental,
  hp.date_of_original_appointment,
  hp.date_of_last_promotion_appointment,
  hp.status,
  COALESCE(hp.is_vacant, false),
  COALESCE(hp.is_funded, true),
  hp.vice,
  hp.civil_service_eligibility,
  hp.comment_annotation,
  hp.gsis_bp_number,
  hp.tin,
  hp.pwd,
  hp.indigenous_people,
  hp.solo_parent,
  hp.last_name,
  hp.first_name,
  hp.middle_name
FROM public.hr_plantilla hp
LEFT JOIN hris.employees e ON e.legacy_id = hp.employee_id;

-- ============================================================
-- Grants (migration 007 only covered pre-existing tables)
-- ============================================================
GRANT ALL    ON hris.plantilla TO authenticated;
GRANT SELECT ON hris.plantilla TO anon;
GRANT ALL    ON hris.plantilla TO service_role;

-- Reload PostgREST schema cache so the new table and its FK to
-- hris.employees are picked up by the API layer.
NOTIFY pgrst, 'reload schema';

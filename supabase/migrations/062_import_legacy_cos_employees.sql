-- Migration 062: Import the COS roster from the legacy adm-v26 system.
--
-- Migration 058 created hris.cos_employees EMPTY by design. This is the
-- one-shot load that fills it.
--
-- SOURCE
-- ------
-- adm-v26 and this app share one Postgres database, so the legacy roster is
-- reachable directly: public.adm_employees WHERE type = 'COS' is exactly the
-- population adm-v26's COS payroll screen reads
-- (app/(protected)/hr/cos-payroll/CosPayrollDetailModal.tsx does
-- `.eq("type", "COS")`). No CSV export/import round trip is needed.
--
-- `type` is the discriminator, NOT `employee_status`: one legacy row carries
-- type='COS' with employee_status='JO'. adm-v26 pays it as COS, so it belongs
-- here, and matching adm-v26's filter is what keeps the two rosters agreeing.
--
-- The same 47 people also exist as dormant hris.employees rows
-- (employment_type='cos', legacy_id = adm_employees.id) from migration 012.
-- Those are deliberately NOT the source and are NOT touched: 058 keeps them
-- alive so their attendance/DTR/leave/CTO history is not cascade-deleted.
-- adm_employees is used instead because it still carries `designation`, which
-- 012 dropped on the floor for COS hires (they have no item_number, so
-- 012's step 2 created no hris.positions row and position_id came out NULL).
--
-- IDEMPOTENCY
-- -----------
-- legacy_id pins each registry row to its adm_employees.id, so re-running
-- picks up newly added legacy COS hires without duplicating anyone. The guard
-- is NOT EXISTS rather than ON CONFLICT because two partial unique indexes can
-- reject a row (legacy_id and cos_no) and ON CONFLICT can only name one of
-- them -- a hand-created registry row that already used a legacy cos_no would
-- abort the whole statement instead of being skipped.

SET search_path TO hris, public, auth, extensions;

-- ── Schema additions ─────────────────────────────────────────────────────

-- Traceability back to the legacy row, and the idempotency key above.
-- Nullable: rows created through the app have no legacy counterpart.
ALTER TABLE hris.cos_employees
  ADD COLUMN IF NOT EXISTS legacy_id BIGINT;

-- adm_employees.monthly_salary has no home on the registry otherwise. It is
-- the contracted rate, and COS payroll prefills from it; the per-period
-- amount still lives on cos_employee_payroll.monthly_rate and may differ.
ALTER TABLE hris.cos_employees
  ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC(12,2);

COMMENT ON COLUMN hris.cos_employees.legacy_id IS
  'adm_employees.id from the legacy adm-v26 system. NULL for records created in this app.';
COMMENT ON COLUMN hris.cos_employees.monthly_rate IS
  'Contracted monthly rate. Reference/default only -- the payable amount for a period is cos_employee_payroll.monthly_rate.';

-- Partial, matching uq_cos_employees_cos_no: a soft-deleted record must not
-- block re-importing its legacy row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cos_employees_legacy_id
  ON hris.cos_employees(legacy_id) WHERE deleted_at IS NULL;

-- ── Import ───────────────────────────────────────────────────────────────
INSERT INTO hris.cos_employees (
  legacy_id,
  cos_no,
  first_name,
  middle_name,
  last_name,
  suffix,
  sex,
  birth_date,
  department_id,
  position_title,
  monthly_rate,
  status
)
SELECT
  ae.id,
  btrim(ae.id_number),
  btrim(ae.firstname),
  nullif(btrim(ae.middlename), ''),
  btrim(ae.lastname),
  nullif(btrim(ae.suffix), ''),
  -- Legacy stores a single letter ('M'/'F'); anything else is left unknown
  -- rather than guessed, since the CHECK allows only male/female.
  CASE upper(left(btrim(coalesce(ae.gender, '')), 1))
    WHEN 'M' THEN 'male'
    WHEN 'F' THEN 'female'
  END,
  hris.safe_to_date(ae.birthday),
  d.id,
  nullif(btrim(ae.designation), ''),
  ae.monthly_salary,
  -- Legacy has no 'inactive' status value for COS; an inactive effectivity
  -- date is how the old system retired someone, so honour it first.
  CASE
    WHEN ae.inactive_effectivity_date IS NOT NULL THEN 'inactive'
    WHEN lower(btrim(coalesce(ae.status, ''))) = 'active' THEN 'active'
    WHEN btrim(coalesce(ae.status, '')) = '' THEN 'active'
    ELSE 'inactive'
  END
FROM public.adm_employees ae
-- Legacy `department` holds an office CODE ('CMO', 'CTO', ...). Migration 012
-- created hris.departments from these same strings with name = code = the
-- legacy value, so both sides are checked. 27 rows carry the placeholder
-- 'COS'; that department row exists and is mapped through as-is rather than
-- silently nulled -- reassigning it is an HR decision, made in the UI.
--
-- LATERAL ... LIMIT 1, not a plain LEFT JOIN: matching on name OR code can hit
-- two different department rows (one whose name equals the legacy string,
-- another whose code does), and a plain join would then emit the employee
-- twice. Code is the stronger signal, so it wins the tiebreak.
LEFT JOIN LATERAL (
  SELECT dep.id
  FROM hris.departments dep
  WHERE lower(btrim(dep.code)) = lower(btrim(ae.department))
     OR lower(btrim(dep.name)) = lower(btrim(ae.department))
  ORDER BY (lower(btrim(dep.code)) = lower(btrim(ae.department))) DESC
  LIMIT 1
) d ON TRUE
WHERE ae.type = 'COS'
  -- cos_no and the names are NOT NULL on the target. A legacy row missing any
  -- of them is skipped rather than aborting the import; it is then visibly
  -- absent from the roster instead of landing there malformed.
  AND nullif(btrim(coalesce(ae.id_number, '')), '') IS NOT NULL
  AND nullif(btrim(coalesce(ae.firstname, '')), '') IS NOT NULL
  AND nullif(btrim(coalesce(ae.lastname,  '')), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM hris.cos_employees c
    WHERE c.deleted_at IS NULL
      AND (c.legacy_id = ae.id OR c.cos_no = btrim(ae.id_number))
  );

NOTIFY pgrst, 'reload schema';

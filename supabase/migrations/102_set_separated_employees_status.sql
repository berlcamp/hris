-- Migration 102: set 21 separated employees to their separation status.
--
-- Source: to_inactive.csv from HR (HRIS ID, Name, Effectivity MM/DD/YYYY, Remarks).
-- The new status comes from Remarks, using the Change Employee Status options:
--   Died                                     -> deceased
--   Retired (Optional), Retired-(Mandatory)  -> retired
--   Resigned                                 -> resigned
--
-- Mirrors changeEmployeeStatus() in src/lib/actions/employee-actions.ts:
--   status                = mapped status above
--   status_effective_date = Effectivity
--   status_remarks        = Remarks, verbatim (keeps Optional vs Mandatory)
-- plus one audit_log row per employee with the old and new values.
--
-- Only rows still 'active' are touched, so a re-run is a no-op and it never
-- overwrites a status someone has changed since.

SET search_path TO hris, public, auth, extensions;

WITH src (id, name, effective_date, remarks) AS (
  VALUES
    ('c4b0f5cb-24b4-4b7f-8b07-9811b9e9897a'::uuid, 'AGUSTIN, EDSON SONOGAN',      DATE '2026-01-06', 'Died'),
    ('4b853070-e2b0-4b0f-b9a8-135729b94594'::uuid, 'ORLINA, ARIEL CATUBAY',       DATE '2026-04-01', 'Retired (Optional)'),
    ('68ecd84b-ef70-4f47-ab4e-be2e4eba3ac1'::uuid, 'TAMPARONG, JHASANEL MUTIA',   DATE '2026-05-01', 'Resigned'),
    ('bb031bbd-ac32-46ac-8e27-73b6ead09070'::uuid, 'CASINTO, FELIPE TUBA',        DATE '2026-05-11', 'Died'),
    ('65c87f2d-053d-41ab-8f3e-fc22d2d3aba3'::uuid, 'HO, REYNALDO MEDINA',         DATE '2026-06-01', 'Retired (Optional)'),
    ('6093c811-cbef-4b5f-b5d1-853017183050'::uuid, 'TAMPARONG, EDILISA BUGSOCAN', DATE '2026-06-01', 'Retired (Optional)'),
    ('eb5ca355-c137-4061-bf70-cf6d6ffd3b8e'::uuid, 'TAPAYAN, JEEFIL SEARES',      DATE '2026-06-01', 'Resigned'),
    ('9a58af47-c4e6-4d4b-8dbe-e8c3dd8750fe'::uuid, 'PARILLA, MARIA VIVIAN PEREZ', DATE '2026-06-26', 'Retired (Optional)'),
    ('c90fa674-7aef-4eb3-9496-4cbc5b97bfab'::uuid, 'BEHIS, SALVADOR PEREZ',       DATE '2026-07-01', 'Retired (Optional)'),
    ('55e210ee-a093-4c5c-8a06-973a42deb391'::uuid, 'GLORIA, FLOREASEL REGIS',     DATE '2026-07-31', 'Retired-(Mandatory)'),
    ('fca02b2e-7eae-409a-8f8e-d0e8e2d93117'::uuid, 'ANTIOLA, SOCRATES TORRES',    DATE '2026-08-01', 'Retired (Optional)'),
    ('62ea2c66-75fe-4b40-ab6c-0d65eea63a5f'::uuid, 'PACANA, ALDEN TAMPARONG',     DATE '2026-08-03', 'Retired-(Mandatory)'),
    ('c1894ebe-8442-4b0e-9b7b-8f1ab07c452f'::uuid, 'RODULFA, JEROME DUNGAN',      DATE '2026-08-07', 'Retired-(Mandatory)'),
    ('d8a832f2-79fc-4c26-b887-3fbec2017276'::uuid, 'ROSARIO, CELIA PEGALAN',      DATE '2026-08-09', 'Retired-(Mandatory)'),
    ('3d539751-f814-45ca-89ef-5b01108907ab'::uuid, 'NIÑAL, MARIFEL DEL ROSARIO',  DATE '2026-08-11', 'Retired-(Mandatory)'),
    ('0b785b07-4d58-4170-8aa1-fad63d14f450'::uuid, 'BALUARTE, ALEX CANDONGO',     DATE '2026-08-19', 'Retired-(Mandatory)'),
    ('0dc14f0e-a982-44b8-94e1-24b271f9bf1d'::uuid, 'BLANDO, EDUARDO EDILO',       DATE '2026-08-21', 'Died'),
    ('5b76ed3b-ecc9-4cec-bdd5-d3faa2bb939a'::uuid, 'ROJO, EVELYN GUMBA',          DATE '2026-09-01', 'Retired (Optional)'),
    ('9ac166de-e424-4417-87f7-3023c7239457'::uuid, 'PORMENTO, MARIA PAZ ALAVE',   DATE '2026-09-28', 'Died'),
    ('7dd7bc25-0e3d-495f-bdce-98cf9de7ba92'::uuid, 'LOMOLJO, CHERELY PALANG',     DATE '2026-10-08', 'Retired-(Mandatory)'),
    ('2af3eeb5-aa48-4d00-ab37-5ba4e6ab59be'::uuid, 'PANG-AN, NAOMI GARBAN',       DATE '2026-11-04', 'Retired-(Mandatory)')
),
mapped AS (
  SELECT src.*,
         (CASE
            WHEN remarks = 'Died'            THEN 'deceased'
            WHEN remarks LIKE 'Retired%'     THEN 'retired'
            WHEN remarks = 'Resigned'        THEN 'resigned'
          END)::hris.employee_status AS new_status
    FROM src
),
old AS (
  SELECT e.id, e.status, e.status_effective_date, e.status_remarks
    FROM hris.employees e
    JOIN mapped m ON m.id = e.id
   WHERE e.status = 'active'
),
upd AS (
  UPDATE hris.employees e
     SET status                = m.new_status,
         status_effective_date = m.effective_date,
         status_remarks        = m.remarks
    FROM mapped m
   WHERE e.id = m.id
     AND m.new_status IS NOT NULL
     AND e.id IN (SELECT id FROM old)
  RETURNING e.id, e.status, e.status_effective_date, e.status_remarks
)
INSERT INTO hris.audit_log (action, table_name, record_id, user_email, old_values, new_values)
SELECT 'employee_status_change',
       'employees',
       upd.id,
       'migration:102_set_separated_employees_status',
       jsonb_build_object(
         'status',                old.status,
         'status_effective_date', old.status_effective_date,
         'status_remarks',        old.status_remarks),
       jsonb_build_object(
         'status',                upd.status,
         'status_effective_date', upd.status_effective_date,
         'status_remarks',        upd.status_remarks)
  FROM upd
  JOIN old ON old.id = upd.id;

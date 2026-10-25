-- Migration 091: Raw punch pool + biometric devices
--
-- Until now each import was bucketed ON ITS OWN: the importer grouped the
-- file's punches by employee + duty date and wrote the result over the day's
-- attendance_logs row. That broke the moment an employee used two devices on
-- one day — log in at Building 1, log out at Building 3. Importing Building 3
-- after Building 1 either skipped the day (overwrite off) or rebuilt it from
-- Building 3's punches only (overwrite on), losing the morning either way, and
-- a replay of either batch wiped the other's punches again.
--
-- This migration keeps every raw punch in ONE pool, hris.attendance_punches.
-- An import adds its punches to the pool, then every employee-day it touched is
-- re-sorted from ALL of that employee's punches, from every device. The order
-- files are imported in no longer matters. attendance_logs stays what the DTR
-- reads: the computed AM/PM result of the pool.
--
-- hris.biometric_devices names the devices. A Dahua export carries no device
-- column, so the importer picks the device the file came from. Employees are
-- enrolled under the same employees.biometric_no on every device, so matching
-- is unchanged.
--
-- Backfill (below, via hris.backfill_attendance_punches):
--   1. Every punch saved in attendance_import_batches.punches (migration 052)
--      enters the pool, attributed to the first batch that carried it. Those
--      punches were cut to HH:MM, so they land as HH:MM:00 with no device.
--   2. Biometric days imported before batches were saved have no raw punches
--      at all. Their stored slot times enter the pool as source 'legacy_log' so
--      a later import for that day merges with them instead of replacing them.
-- Nothing here writes attendance_logs: existing days only change when an
-- import or replay re-sorts them.

SET search_path TO hris, public, auth, extensions;

CREATE TABLE IF NOT EXISTS hris.biometric_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  location TEXT,
  serial_no TEXT,
  -- Deactivate rather than delete: punches reference the device forever.
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hris.attendance_import_batches
  ADD COLUMN IF NOT EXISTS device_id UUID
    REFERENCES hris.biometric_devices(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS hris.attendance_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The employee number exactly as the device recorded it. Matched against
  -- employees.biometric_no; kept even when nothing matches, so a punch for an
  -- employee whose number is set later is not lost.
  employee_no TEXT NOT NULL,
  employee_name TEXT,
  employee_id UUID REFERENCES hris.employees(id) ON DELETE SET NULL,
  -- Device wall-clock (Manila) date and time, seconds included. Plain DATE and
  -- TIME, not TIMESTAMPTZ: there is no zone to get wrong (see migration 035).
  punch_date DATE NOT NULL,
  punch_time TIME(0) NOT NULL,
  -- Attendance Status as the device labelled it (lower-cased), '' when none.
  device_status TEXT NOT NULL DEFAULT '',
  device_id UUID REFERENCES hris.biometric_devices(id) ON DELETE RESTRICT,
  import_batch_id UUID
    REFERENCES hris.attendance_import_batches(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'biometric'
    CHECK (source IN ('biometric', 'legacy_log')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The same file uploaded twice, or two overlapping exports of one device,
  -- add nothing the second time. NULLS NOT DISTINCT so backfilled punches with
  -- no device also dedupe.
  CONSTRAINT attendance_punches_unique
    UNIQUE NULLS NOT DISTINCT (employee_no, punch_date, punch_time, device_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_punches_employee_date
  ON hris.attendance_punches(employee_id, punch_date);
CREATE INDEX IF NOT EXISTS idx_attendance_punches_batch
  ON hris.attendance_punches(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_punches_unmatched
  ON hris.attendance_punches(employee_no)
  WHERE employee_id IS NULL;

-- Personal data. Read and written only by attendance-manager server actions on
-- the admin client; no policies, so no other role sees a row.
ALTER TABLE hris.biometric_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.attendance_punches ENABLE ROW LEVEL SECURITY;

-- Links pool punches to employees whose biometric_no now matches. Run by
-- replay, so punches imported before an employee's number was set get sorted.
CREATE OR REPLACE FUNCTION hris.rematch_attendance_punches()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
  WITH upd AS (
    UPDATE hris.attendance_punches p
       SET employee_id = e.id
      FROM hris.employees e
     WHERE p.employee_id IS NULL
       AND e.biometric_no::text = p.employee_no
    RETURNING 1
  )
  SELECT count(*)::int FROM upd;
$$;

-- Fills the pool from data saved before it existed. Idempotent: every insert is
-- ON CONFLICT DO NOTHING / NOT EXISTS, so running it again adds nothing.
CREATE OR REPLACE FUNCTION hris.backfill_attendance_punches()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
DECLARE
  v_batch INT;
  v_legacy INT;
BEGIN
  -- 1. Saved batch punches, oldest batch first so a punch carried by several
  --    batches is attributed to the one that first brought it in.
  INSERT INTO hris.attendance_punches
    (employee_no, employee_name, employee_id, punch_date, punch_time,
     device_status, device_id, import_batch_id, source)
  SELECT p->>'employeeNo',
         p->>'employeeName',
         e.id,
         (p->>'date')::date,
         (p->>'time')::time,
         lower(COALESCE(p->>'status', '')),
         b.device_id,
         b.id,
         'biometric'
    FROM hris.attendance_import_batches b
    CROSS JOIN LATERAL jsonb_array_elements(b.punches) p
    LEFT JOIN hris.employees e ON e.biometric_no::text = p->>'employeeNo'
   WHERE COALESCE(p->>'employeeNo', '') <> ''
     AND p->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
     AND p->>'time' ~ '^\d{2}:\d{2}(:\d{2})?$'
   ORDER BY b.imported_at, b.id
  ON CONFLICT ON CONSTRAINT attendance_punches_unique DO NOTHING;
  GET DIAGNOSTICS v_batch = ROW_COUNT;

  -- 2. Biometric days with no raw punch in the pool for that employee on that
  --    date: their stored slot times stand in for the punches. AT TIME ZONE
  --    'UTC' reads the stored wall-clock digits (migration 035).
  INSERT INTO hris.attendance_punches
    (employee_no, employee_name, employee_id, punch_date, punch_time,
     device_status, source)
  SELECT e.biometric_no::text,
         NULL,
         l.employee_id,
         (s.ts AT TIME ZONE 'UTC')::date,
         (s.ts AT TIME ZONE 'UTC')::time(0),
         '',
         'legacy_log'
    FROM hris.attendance_logs l
    JOIN hris.employees e ON e.id = l.employee_id
    CROSS JOIN LATERAL (
      VALUES (l.time_in_am), (l.time_out_am), (l.time_in_pm), (l.time_out_pm)
    ) AS s(ts)
   WHERE l.source = 'biometric'
     AND s.ts IS NOT NULL
     AND e.biometric_no IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM hris.attendance_punches p
        WHERE p.employee_id = l.employee_id
          AND p.punch_date = l.date
          AND p.source = 'biometric'
     )
  ON CONFLICT ON CONSTRAINT attendance_punches_unique DO NOTHING;
  GET DIAGNOSTICS v_legacy = ROW_COUNT;

  RETURN v_batch + v_legacy;
END;
$$;

REVOKE ALL ON FUNCTION hris.rematch_attendance_punches() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION hris.backfill_attendance_punches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hris.rematch_attendance_punches() TO service_role;
GRANT EXECUTE ON FUNCTION hris.backfill_attendance_punches() TO service_role;

SELECT hris.backfill_attendance_punches();

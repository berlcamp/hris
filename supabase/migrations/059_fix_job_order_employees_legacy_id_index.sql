-- Migration 059: Fix hris.job_order_employees legacy_id unique index.
--
-- Migration 056 created this index as PARTIAL:
--
--   CREATE UNIQUE INDEX ... ON hris.job_order_employees(legacy_id)
--     WHERE legacy_id IS NOT NULL;
--
-- That is wrong. Postgres can only satisfy ON CONFLICT inference against a
-- partial unique index if the conflicting statement repeats the index's
-- predicate verbatim — and PostgREST's `.upsert(rows, { onConflict: "legacy_id" })`
-- (used by src/lib/actions/job-order-csv-import-actions.ts) never emits one.
-- Every upsert therefore failed with:
--
--   ERROR:  there is no unique or exclusion constraint matching the
--   ON CONFLICT specification  (SQLSTATE 42P10)
--
-- which broke legacy_id upsert idempotency — the foundation of the entire
-- Job Orders data-migration strategy — for every single row.
--
-- The fix is to drop the WHERE predicate entirely. It was never necessary:
-- Postgres unique indexes already treat NULL as distinct from every other
-- NULL by default, so a plain (non-partial) unique index on legacy_id still
-- allows unlimited rows with legacy_id IS NULL — i.e. Job Order employees
-- created by hand in the app, rather than imported from the legacy system,
-- are completely unaffected by this change.
--
-- Do NOT "optimise" this predicate back in. It looks redundant/harmless but
-- it silently breaks ON CONFLICT (legacy_id) upserts issued via PostgREST.
--
-- Grants: not needed — migration 020 already set default privileges for new
-- objects in the hris schema; this migration only replaces an index.

SET search_path TO hris, public, auth, extensions;

DROP INDEX IF EXISTS hris.uq_job_order_employees_legacy_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_order_employees_legacy_id
  ON hris.job_order_employees(legacy_id);

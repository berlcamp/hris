-- Migration 060: Enable RLS on the Job Orders tables.
--
-- Migration 056 created hris.job_order_areas and hris.job_order_employees but
-- never enabled row-level security on them. Migration 020 grants broad default
-- privileges on new tables in the hris schema to `authenticated` (ALL) and
-- `anon` (SELECT) — with no RLS above those grants, both tables were wide
-- open: the anon key ships in the browser bundle, so anyone could read every
-- Job Order person's name, address, SSS number, LandBank account number and
-- daily rate, and any authenticated user (including a plain `employee`) could
-- hard-DELETE or UPDATE rows directly via PostgREST, bypassing every
-- TypeScript guard and the soft-delete convention. These people previously
-- lived in hris.employees, which HAS RLS, so this was a protection downgrade
-- for the same population.
--
-- Fixed here rather than by editing 056 because 056 may already be applied in
-- production.
--
-- No GRANTs are added: all server actions in job-order-actions.ts and
-- job-order-area-actions.ts use the service-role admin client
-- (createAdminClient), which bypasses RLS entirely, so nothing in the app
-- changes behavior. This only closes the anon/authenticated PostgREST path.
--
-- hris.get_user_role() is defined in 007_rls_policies.sql — reused, not
-- redefined.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.job_order_areas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.job_order_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_job_order_areas" ON hris.job_order_areas
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin', 'jo_manager'));

CREATE POLICY "admin_all_job_order_employees" ON hris.job_order_employees
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin', 'jo_manager'));

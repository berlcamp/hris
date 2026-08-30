-- An account can hold more than one role.
--
-- Until now `user_profiles.role` was the whole story: one enum value per
-- account, and every permission in the application read off it. That forced
-- composite enum values into existence whenever somebody genuinely wore two
-- hats — `department_admin_and_department_head` is that scar — and left no way
-- at all to express the ordinary combinations HR keeps asking for (an HR Admin
-- who also runs Job Orders, a DTR Manager who is also a Department Head).
--
-- This adds `roles`, the array that is now the source of truth, and keeps
-- `role` as a DERIVED mirror: the account's PRIMARY role, meaning the one with
-- the widest data reach in `roles`. Both directions are maintained by a
-- trigger, so:
--
--   * old code and old RLS policies that read `role` keep working, and read the
--     WIDEST of the account's roles — never a narrower one, so nothing that
--     used to be visible disappears and nothing narrow silently widens;
--   * new code reads `roles` for "may this account do X", where every role the
--     account holds contributes its grants (see src/lib/auth-helpers.ts);
--   * a row written by either column alone stays consistent.
--
-- Why the primary role is the WIDEST rather than the first listed: the
-- application branches on `role` in a handful of places to decide how much data
-- to SHOW (own record / own department / everything). Feeding those a narrow
-- role while the account also holds a wide one would hide data the account is
-- entitled to; feeding them the widest is exactly the old behaviour for a
-- single-role account and the correct one for a multi-role account.
--
-- Re-runnable.

SET search_path TO hris, public, auth, extensions;

-- ── The array column ──────────────────────────────────────────────────────
ALTER TABLE hris.user_profiles
  ADD COLUMN IF NOT EXISTS roles hris.user_role[];

-- Backfill: every existing account keeps exactly the role it has today.
UPDATE hris.user_profiles
SET roles = ARRAY[role]::hris.user_role[]
WHERE roles IS NULL OR cardinality(roles) = 0;

-- Deliberately NO default. An INSERT that names only `role` — the legacy shape,
-- and anything written by a client that predates this migration — must leave
-- `roles` NULL so the trigger can build it from that role. A default of
-- {employee} would look like a deliberate choice instead, and the account would
-- silently come out an Employee whatever role the insert asked for.
ALTER TABLE hris.user_profiles
  ALTER COLUMN roles DROP DEFAULT;

-- Safe alongside the absent default: the trigger below runs BEFORE INSERT and
-- always leaves a non-empty array behind.
ALTER TABLE hris.user_profiles
  ALTER COLUMN roles SET NOT NULL;

COMMENT ON COLUMN hris.user_profiles.roles IS
  'Every role this account holds. Source of truth for permissions. user_profiles.role mirrors the widest of these — see hris.user_role_rank.';

COMMENT ON COLUMN hris.user_profiles.role IS
  'DERIVED: the primary (widest-reaching) role in user_profiles.roles, maintained by hris.sync_user_profile_roles. Kept for the RLS policies and any code that predates the roles array. Write to roles, not here.';

-- An account with no role at all would be invisible to every permission check
-- and impossible to reason about, so the array is never empty.
ALTER TABLE hris.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_roles_not_empty;
ALTER TABLE hris.user_profiles
  ADD CONSTRAINT user_profiles_roles_not_empty CHECK (cardinality(roles) > 0);

-- ── Which role is the "primary" one ───────────────────────────────────────
-- Lower rank = wider data reach. This ordering is mirrored, and explained at
-- length, in ROLE_PRECEDENCE in src/lib/auth-helpers.ts — change both together.
CREATE OR REPLACE FUNCTION hris.user_role_rank(r hris.user_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE r
    WHEN 'super_admin' THEN 1
    WHEN 'hr_admin' THEN 2
    WHEN 'ocm_admin' THEN 3
    WHEN 'dtr_manager' THEN 4
    WHEN 'hr_record_manager' THEN 5
    WHEN 'department_admin_and_department_head' THEN 6
    WHEN 'department_head' THEN 7
    WHEN 'department_admin' THEN 8
    WHEN 'jo_manager' THEN 9
    WHEN 'cos_manager' THEN 10
    WHEN 'event_attendance_officer' THEN 11
    WHEN 'employee' THEN 12
    ELSE 99
  END;
$$;

CREATE OR REPLACE FUNCTION hris.primary_user_role(rs hris.user_role[])
RETURNS hris.user_role
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT r
  FROM unnest(rs) AS r
  ORDER BY hris.user_role_rank(r), r::text
  LIMIT 1;
$$;

-- ── Keeping role and roles in step ────────────────────────────────────────
-- Three cases, in order:
--   1. roles was left alone but role changed  -> rebuild roles from role
--      (an old client, or a hand-written UPDATE, setting only the old column)
--   2. roles is empty                          -> fall back to role
--   3. otherwise                               -> role := primary of roles
CREATE OR REPLACE FUNCTION hris.sync_user_profile_roles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.role IS DISTINCT FROM OLD.role
     AND NEW.roles IS NOT DISTINCT FROM OLD.roles THEN
    NEW.roles := ARRAY[NEW.role]::hris.user_role[];
  END IF;

  IF NEW.roles IS NULL OR cardinality(NEW.roles) = 0 THEN
    NEW.roles := ARRAY[COALESCE(NEW.role, 'employee')]::hris.user_role[];
  END IF;

  -- Deduplicate; the array is a set, and a duplicate would double every badge
  -- the UI renders off it.
  -- DISTINCT in the subquery rather than in array_agg: Postgres only allows
  -- ORDER BY inside an aggregate with DISTINCT when it sorts by the argument
  -- itself, and the sort here is by rank.
  SELECT array_agg(d.r ORDER BY hris.user_role_rank(d.r), d.r::text)
  INTO NEW.roles
  FROM (SELECT DISTINCT unnest(NEW.roles) AS r) AS d;

  NEW.role := hris.primary_user_role(NEW.roles);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_sync_roles ON hris.user_profiles;
CREATE TRIGGER user_profiles_sync_roles
  BEFORE INSERT OR UPDATE ON hris.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION hris.sync_user_profile_roles();

-- Normalize what is already there (sorts each backfilled array, no-op values).
UPDATE hris.user_profiles SET roles = roles;

-- ── RLS ───────────────────────────────────────────────────────────────────
-- The ~100 policies from 007/029 read hris.get_user_role(), a scalar. They stay
-- as they are: `role` is now the widest role the account holds, so each policy
-- grants exactly what that role granted before. hris.user_has_role() is added
-- for policies written from here on, which can test the whole set.
CREATE OR REPLACE FUNCTION hris.user_has_role(VARIADIC wanted hris.user_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM hris.user_profiles
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
      AND roles && wanted
  );
$$;

COMMENT ON FUNCTION hris.user_has_role(hris.user_role[]) IS
  'True when the signed-in account holds ANY of the given roles. Roles-array aware counterpart to hris.get_user_role().';

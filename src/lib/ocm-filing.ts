// Relative, with the extension, so the unit tests can load this module under
// `node --experimental-strip-types` — the same convention as
// src/lib/attendance-record.ts. The `@/` alias stays fine for type-only imports.
import { hasAnyRole, type RoleInput } from "./auth-helpers.ts";

// ── Who may act on a filing an OCM Admin made ─────────────────────────────
//
// An OCM Admin files leave and CTO for employees of any department, going
// around the department head who would normally be the first approver. The
// filing is therefore "owned" by that OCM Admin: a department-scoped account
// must not approve, reject or cancel something it was never routed.
//
// The ownership stops at the department, though. HR Admin, Super Admin and the
// other OCM Admins act on the filing like any other — HR approving it IS step 3
// of the workflow. Locking every step to one person is what the rule did when
// it was first written (June 2026), and a filing whose author was away then had
// no way through at all: 31 leaves had piled up unapprovable by September.
//
// Both modules and both UIs go through the two functions below so the rule has
// exactly one definition. Unit tests: supabase/tests/ocm-filing.test.mts.

/** The `created_by_profile` embed, which PostgREST may hand back either way. */
export type CreatorRoleRel = { role: string } | { role: string }[] | null | undefined;

export interface OcmFiledRecord {
  created_by?: string | null;
  created_by_profile?: CreatorRoleRel;
}

function creatorRole(rel: CreatorRoleRel): string | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0]?.role ?? null : rel.role ?? null;
}

/**
 * The OCM Admin who owns this filing, or null when it was filed by anyone else.
 *
 * Read from the creator's CURRENT role on `user_profiles`, so an account that
 * has since been made an OCM Admin owns what it filed before, and one that has
 * left the role no longer does.
 */
export function ocmFilingOwnerId(app: OcmFiledRecord): string | null {
  return creatorRole(app.created_by_profile) === "ocm_admin"
    ? app.created_by ?? null
    : null;
}

/**
 * Does the ownership rule stop this account from acting on the filing?
 *
 * `ownerId` is what `ocmFilingOwnerId` returned: null for anything an OCM Admin
 * did not file, which blocks nobody.
 */
export function ocmFilingBlocks(
  ownerId: string | null | undefined,
  user: { id: string; roles: RoleInput },
): boolean {
  if (!ownerId || ownerId === user.id) return false;
  return !hasAnyRole(user.roles, "hr_admin", "super_admin", "ocm_admin");
}

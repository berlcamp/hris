import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRoles } from "@/lib/auth-helpers";
import type { UserRole } from "@/lib/types";

export interface ServerUser {
  id: string;
  email: string;
  fullName: string;
  /**
   * The PRIMARY role: the widest-reaching of `roles`, mirrored from
   * user_profiles.role by the database. Use it to decide SCOPE (whose records
   * this account sees) and `roles` to decide GRANTS.
   */
  role: UserRole;
  /**
   * Every role this account holds (migration 087). This is what the grant
   * helpers in src/lib/auth-helpers.ts take: a power reaches the account if ANY
   * of these roles carries it.
   */
  roles: UserRole[];
  departmentId: string | null;
  isActive: boolean;
  /** Department Admin only — see canOpenAttendanceCorrections. */
  canAccessAttendanceCorrections: boolean;
  /** Module managers only — see canManageJobOrderPayroll. */
  canManageModulePayroll: boolean;
  avatarUrl: string | null;
}

export async function getServerUser(): Promise<ServerUser | null> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser?.email) return null;

  const adminClient = createAdminClient();

  const { data: profile } = await adminClient
    .schema("hris")
    .from("user_profiles")
    .select(
      "id, email, full_name, role, roles, department_id, is_active, can_access_attendance_corrections, can_manage_module_payroll, avatar_url",
    )
    .eq("email", authUser.email)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role as UserRole,
    // A row written before migration 087 (or by a client that only knows the
    // scalar) still answers every grant check through its single role.
    roles: normalizeRoles(profile.roles, profile.role),
    departmentId: profile.department_id,
    isActive: profile.is_active,
    canAccessAttendanceCorrections:
      profile.can_access_attendance_corrections ?? true,
    canManageModulePayroll: profile.can_manage_module_payroll ?? true,
    avatarUrl: profile.avatar_url,
  };
}

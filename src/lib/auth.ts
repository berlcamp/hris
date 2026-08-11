import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";

export interface ServerUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
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
      "id, email, full_name, role, department_id, is_active, can_access_attendance_corrections, can_manage_module_payroll, avatar_url",
    )
    .eq("email", authUser.email)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role as UserRole,
    departmentId: profile.department_id,
    isActive: profile.is_active,
    canAccessAttendanceCorrections:
      profile.can_access_attendance_corrections ?? true,
    canManageModulePayroll: profile.can_manage_module_payroll ?? true,
    avatarUrl: profile.avatar_url,
  };
}

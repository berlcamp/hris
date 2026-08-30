"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_PRECEDENCE, hasAnyRole, isDeptAdmin } from "@/lib/auth-helpers";
import type { UserRole } from "@/lib/types";

export interface CreateUserInput {
  full_name: string;
  email: string;
  /**
   * Every role this account holds. The database derives user_profiles.role
   * (the primary, widest role) from it — see migration 087 — so nothing here
   * writes that column.
   */
  roles: string[];
  department_id: string | null;
  is_active: boolean;
  /** Department Admin only — see migration 076. */
  can_access_attendance_corrections: boolean;
  /** Module managers (JO / COS) only — see migration 077. */
  can_manage_module_payroll: boolean;
}

/** The roles the payroll switch qualifies — mirrors auth-helpers'. */
const MODULE_MANAGER_ROLES: readonly UserRole[] = ["jo_manager", "cos_manager"];

// The corrections switch qualifies the Department Admin role and nothing else,
// so it is only stored as given for an account that holds one. Every other
// account is written back as TRUE — not because they need it (nothing reads the
// column for them), but so an account that was a Department Admin with access
// revoked does not carry a hidden "off" into a role set where the form never
// showed the box.
function correctionsAccessFor(input: CreateUserInput): boolean {
  return isDeptAdmin(input.roles as UserRole[])
    ? input.can_access_attendance_corrections
    : true;
}

/** Same rule as correctionsAccessFor, for the module-manager payroll switch. */
function modulePayrollAccessFor(input: CreateUserInput): boolean {
  return hasAnyRole(input.roles as UserRole[], ...MODULE_MANAGER_ROLES)
    ? input.can_manage_module_payroll
    : true;
}

/**
 * Cleans a submitted role set into what actually goes in the column: no
 * duplicates, no empties, ordered widest-first so the stored array reads the
 * same way the UI lists it and the database's own ordering agrees.
 *
 * Returns null when nothing usable is left — the caller turns that into an
 * error rather than writing an account nobody can use.
 */
function normalizeRoleSelection(roles: string[] | undefined): UserRole[] | null {
  const unique = Array.from(new Set((roles ?? []).filter(Boolean))) as UserRole[];
  if (unique.length === 0) return null;

  return unique.sort((a, b) => {
    const rank = (r: UserRole) => {
      const i = ROLE_PRECEDENCE.indexOf(r);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return rank(a) - rank(b);
  });
}

export interface UpdateUserInput extends CreateUserInput {
  id: string;
}

export async function getUsers() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("user_profiles")
    .select("*, departments(name, code)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getUserById(id: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("user_profiles")
    .select("*, departments(name, code)")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function getDepartments() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("departments")
    .select("id, name, code")
    .order("name");

  if (error) throw error;
  return data;
}

export async function createUser(input: CreateUserInput) {
  const roles = normalizeRoleSelection(input.roles);
  if (!roles) return { error: "Select at least one role." };
  if (roles.includes("super_admin")) {
    return { error: "Cannot create a super admin user." };
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("user_profiles")
    .insert({
      full_name: input.full_name,
      email: input.email,
      // Only `roles` is written: the trigger from migration 087 derives
      // user_profiles.role (the primary, widest role) from it.
      roles,
      department_id: input.department_id,
      is_active: input.is_active,
      can_access_attendance_corrections: correctionsAccessFor(input),
      can_manage_module_payroll: modulePayrollAccessFor(input),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A user with this email already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { data };
}

export async function updateUser(input: UpdateUserInput) {
  const roles = normalizeRoleSelection(input.roles);
  if (!roles) return { error: "Select at least one role." };
  if (roles.includes("super_admin")) {
    return { error: "Cannot assign super admin role." };
  }

  // Prevent editing the super admin user
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .schema("hris")
    .from("user_profiles")
    .select("roles")
    .eq("id", input.id)
    .single();

  if (existing?.roles?.includes("super_admin")) {
    return { error: "The super admin account cannot be modified." };
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("user_profiles")
    .update({
      full_name: input.full_name,
      email: input.email,
      // See createUser: `role` is derived from this by the database.
      roles,
      department_id: input.department_id,
      is_active: input.is_active,
      can_access_attendance_corrections: correctionsAccessFor(input),
      can_manage_module_payroll: modulePayrollAccessFor(input),
    })
    .eq("id", input.id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A user with this email already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { data };
}

export async function deactivateUser(id: string) {
  const supabase = createAdminClient();

  // Prevent deactivating the super admin
  const { data: existing } = await supabase
    .schema("hris")
    .from("user_profiles")
    .select("roles")
    .eq("id", id)
    .single();

  if (existing?.roles?.includes("super_admin")) {
    return { error: "The super admin account cannot be deactivated." };
  }

  const { error } = await supabase
    .schema("hris")
    .from("user_profiles")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}

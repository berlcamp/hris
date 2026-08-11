"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeptAdmin } from "@/lib/auth-helpers";
import type { UserRole } from "@/lib/types";

export interface CreateUserInput {
  full_name: string;
  email: string;
  role: string;
  department_id: string | null;
  is_active: boolean;
  /** Department Admin only — see migration 076. */
  can_access_attendance_corrections: boolean;
  /** Module managers (JO / COS) only — see migration 077. */
  can_manage_module_payroll: boolean;
}

/** The roles the payroll switch qualifies — mirrors auth-helpers'. */
const MODULE_MANAGER_ROLES = ["jo_manager", "cos_manager"];

// The corrections switch qualifies the Department Admin role and nothing else,
// so it is only stored as given for those roles. Every other role is written
// back as TRUE — not because they need it (nothing reads the column for them),
// but so an account that was a Department Admin with access revoked does not
// carry a hidden "off" into a role where the form never showed the box.
function correctionsAccessFor(input: CreateUserInput): boolean {
  return isDeptAdmin(input.role as UserRole)
    ? input.can_access_attendance_corrections
    : true;
}

/** Same rule as correctionsAccessFor, for the module-manager payroll switch. */
function modulePayrollAccessFor(input: CreateUserInput): boolean {
  return MODULE_MANAGER_ROLES.includes(input.role)
    ? input.can_manage_module_payroll
    : true;
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
  if (input.role === "super_admin") {
    return { error: "Cannot create a super admin user." };
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("hris")
    .from("user_profiles")
    .insert({
      full_name: input.full_name,
      email: input.email,
      role: input.role,
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
  if (input.role === "super_admin") {
    return { error: "Cannot assign super admin role." };
  }

  // Prevent editing the super admin user
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .schema("hris")
    .from("user_profiles")
    .select("role")
    .eq("id", input.id)
    .single();

  if (existing?.role === "super_admin") {
    return { error: "The super admin account cannot be modified." };
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("user_profiles")
    .update({
      full_name: input.full_name,
      email: input.email,
      role: input.role,
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
    .select("role")
    .eq("id", id)
    .single();

  if (existing?.role === "super_admin") {
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

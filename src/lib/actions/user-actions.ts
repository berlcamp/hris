"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CreateUserInput {
  full_name: string;
  email: string;
  role: string;
  department_id: string | null;
  is_active: boolean;
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

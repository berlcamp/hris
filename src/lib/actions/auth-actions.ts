"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export interface AuthUserData {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  departmentId: string | null;
  isActive: boolean;
  avatarUrl: string | null;
}

export async function getCurrentUser(): Promise<AuthUserData | null> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser?.email) return null;

  // Use admin client to bypass RLS
  const adminClient = createAdminClient();

  const { data: profile } = await adminClient
    .schema("hris")
    .from("user_profiles")
    .select("id, email, full_name, role, department_id, is_active, avatar_url")
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
    avatarUrl: profile.avatar_url,
  };
}

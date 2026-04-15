"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";

// System settings are stored as key-value pairs in a simple approach
// Since we may not have a system_settings table, we use a JSON column
// or fall back to a defaults object

export interface SystemSettings {
  lgu_name: string;
  lgu_address: string;
  standard_am_in: string;
  standard_am_out: string;
  standard_pm_in: string;
  standard_pm_out: string;
  grace_period_minutes: number;
  nosi_eligibility_years: number;
  vl_annual_credits: number;
  sl_annual_credits: number;
}

const DEFAULT_SETTINGS: SystemSettings = {
  lgu_name: "Local Government Unit",
  lgu_address: "",
  standard_am_in: "08:00",
  standard_am_out: "12:00",
  standard_pm_in: "13:00",
  standard_pm_out: "17:00",
  grace_period_minutes: 0,
  nosi_eligibility_years: 3,
  vl_annual_credits: 15,
  sl_annual_credits: 15,
};

// Store settings in the audit_log table as a special "system_settings" record
// This avoids needing a DDL migration. In production, create a proper table.
// For now we use a simple approach: store as a JSON blob in a known location.

async function getSettingsFromDb(): Promise<Record<string, string> | null> {
  const supabase = createAdminClient();

  try {
    const { data } = await supabase
      .schema("hris")
      .from("audit_log")
      .select("new_values")
      .eq("action", "system_settings_store")
      .eq("table_name", "system_settings")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.new_values) {
      return data.new_values as Record<string, string>;
    }
  } catch {
    // Table might not exist or other error
  }
  return null;
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const stored = await getSettingsFromDb();
  if (!stored) return DEFAULT_SETTINGS;

  return {
    lgu_name: (stored.lgu_name as string) ?? DEFAULT_SETTINGS.lgu_name,
    lgu_address: (stored.lgu_address as string) ?? DEFAULT_SETTINGS.lgu_address,
    standard_am_in: (stored.standard_am_in as string) ?? DEFAULT_SETTINGS.standard_am_in,
    standard_am_out: (stored.standard_am_out as string) ?? DEFAULT_SETTINGS.standard_am_out,
    standard_pm_in: (stored.standard_pm_in as string) ?? DEFAULT_SETTINGS.standard_pm_in,
    standard_pm_out: (stored.standard_pm_out as string) ?? DEFAULT_SETTINGS.standard_pm_out,
    grace_period_minutes: Number(stored.grace_period_minutes) || DEFAULT_SETTINGS.grace_period_minutes,
    nosi_eligibility_years: Number(stored.nosi_eligibility_years) || DEFAULT_SETTINGS.nosi_eligibility_years,
    vl_annual_credits: Number(stored.vl_annual_credits) || DEFAULT_SETTINGS.vl_annual_credits,
    sl_annual_credits: Number(stored.sl_annual_credits) || DEFAULT_SETTINGS.sl_annual_credits,
  };
}

export async function updateSystemSettings(settings: Partial<SystemSettings>) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") {
    throw new Error("Unauthorized");
  }

  const current = await getSystemSettings();
  const merged = { ...current, ...settings };

  const supabase = createAdminClient();

  // Store as an audit log entry with a special action
  await supabase.schema("hris").from("audit_log").insert({
    user_id: user.id,
    user_email: user.email,
    action: "system_settings_store",
    table_name: "system_settings",
    old_values: current as unknown as Record<string, unknown>,
    new_values: merged as unknown as Record<string, unknown>,
  });

  revalidatePath("/admin/settings");
  return { success: true };
}

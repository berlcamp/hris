"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { isAttendanceManager } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";

// The biometric devices an import can come from (migration 091). A Dahua export
// carries no device column, so the importer names the device the file was
// pulled from; the punches it adds remember it.

export interface BiometricDeviceRow {
  id: string;
  name: string;
  location: string | null;
  is_active: boolean;
}

const NAME_MAX = 80;

export async function getBiometricDevices(): Promise<BiometricDeviceRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.roles)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("biometric_devices")
    .select("id, name, location, is_active")
    .order("name");
  if (error) throw error;
  return (data ?? []) as BiometricDeviceRow[];
}

export async function createBiometricDevice(input: {
  name: string;
  location?: string | null;
}): Promise<BiometricDeviceRow> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.roles)) {
    throw new Error("Unauthorized");
  }
  const name = input.name.trim().replace(/\s+/g, " ");
  const location = input.location?.trim() || null;
  if (!name) throw new Error("Give the device a name, e.g. “Building 1 – Lobby”.");
  if (name.length > NAME_MAX) {
    throw new Error(`Device name must be ${NAME_MAX} characters or fewer.`);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("biometric_devices")
    .insert({ name, location })
    .select("id, name, location, is_active")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`A device named “${name}” already exists.`);
    throw error;
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "create_biometric_device",
    tableName: "biometric_devices",
    recordId: data.id,
    newValues: { name, location },
  });
  return data as BiometricDeviceRow;
}

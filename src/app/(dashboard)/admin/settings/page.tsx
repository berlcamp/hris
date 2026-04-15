import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getSystemSettings } from "@/lib/actions/settings-actions";
import { SystemSettingsForm } from "@/components/admin/system-settings-form";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/dashboard");

  const settings = await getSystemSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          System Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure system-wide parameters for attendance, leave provisioning,
          and NOSI eligibility.
        </p>
      </div>
      <SystemSettingsForm settings={settings} />
    </div>
  );
}

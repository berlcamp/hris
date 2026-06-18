import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getSchedulesWithCounts } from "@/lib/actions/schedule-actions";
import { ScheduleManager } from "@/components/admin/schedule-manager";
import { canManageSchedules } from "@/lib/auth-helpers";

export default async function SchedulesAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageSchedules(user.role)) redirect("/dashboard");

  const schedules = await getSchedulesWithCounts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Work Schedules</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define shift templates and assign employees to them. The Dahua
          importer and DTR use the assigned schedule to bucket punches,
          compute tardiness, and decide whether a lunch break is expected.
        </p>
      </div>
      <ScheduleManager initialSchedules={schedules} />
    </div>
  );
}

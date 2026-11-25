import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDtrCreatorContext } from "@/lib/actions/dtr-creator-actions";
import { getSchedules } from "@/lib/actions/schedule-actions";
import { canCreateDtr, DTR_CREATOR_ENABLED } from "@/lib/auth-helpers";
import { DtrCreatorForm } from "@/components/dtr-creator/dtr-creator-form";

export default async function DtrCreatorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Same call the sidebar makes to show the item. The actions re-check it on
  // every call; this only turns a refusal into a redirect.
  if (!DTR_CREATOR_ENABLED || !canCreateDtr(user)) redirect("/dashboard");

  const [context, schedules] = await Promise.all([
    getDtrCreatorContext(),
    getSchedules(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">DTR Creator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create attendance for several employees of a department at once. Only
          days with no record are written; days that already have one are
          skipped. Everything saved here is edited afterwards in Attendance
          Corrections.
        </p>
      </div>
      <DtrCreatorForm
        departments={context.departments}
        lockedDepartmentId={context.lockedDepartmentId}
        correctionWindow={context.window}
        schedules={schedules}
      />
    </div>
  );
}

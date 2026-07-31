import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDepartments } from "@/lib/actions/user-actions";
import { canDownloadWeeklyDtr, isDeptScoped } from "@/lib/auth-helpers";
import { startOfWeek, toIsoDate } from "@/lib/week-range";
import { WeeklyDtrClient } from "@/components/weekly-dtr/weekly-dtr-client";

export default async function WeeklyDtrPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canDownloadWeeklyDtr(user.role)) redirect("/dashboard");

  // A department-scoped user gets no picker: the server pins them to their own
  // department anyway (see resolveScope in weekly-dtr-actions), so offering a
  // choice would only be a control that does nothing.
  const scoped = isDeptScoped(user.role);
  const departments = await getDepartments();
  const ownDepartment = scoped
    ? departments.find((d) => d.id === user.departmentId) ?? null
    : null;

  if (scoped && !ownDepartment) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Weekly DTR</h1>
        <p className="text-sm text-muted-foreground">
          Your account is not assigned to a department yet, so there is no
          roster to generate. Ask an administrator to set your department.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Weekly DTR</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Download the CSC Form 48 DTR for one week —{" "}
          {ownDepartment
            ? `for everyone assigned or detailed to ${ownDepartment.name}`
            : "for everyone assigned or detailed to a department"}
          . Only employees with recorded time entries for that week appear.
        </p>
      </div>

      {/* Shown to the department-scoped roles only. HR and the super admin
          already know which devices have been rolled out; a department admin
          looking at a short roster needs to be told that the gap is a device
          migration and not a missing DTR they should chase. */}
      {scoped && (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            These DTRs are generated from the{" "}
            <strong>newly installed biometric device</strong> only. Any employee
            still logging attendance on the old device will not appear here, and
            this DTR does not apply to them — keep using your existing process
            for those employees until they are migrated.
          </span>
        </p>
      )}

      <WeeklyDtrClient
        departments={scoped ? [] : departments}
        lockedDepartment={ownDepartment}
        currentWeekStart={startOfWeek(toIsoDate(new Date()))}
      />
    </div>
  );
}

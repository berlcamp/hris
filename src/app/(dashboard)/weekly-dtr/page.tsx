import { redirect } from "next/navigation";
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
      <WeeklyDtrClient
        departments={scoped ? [] : departments}
        lockedDepartment={ownDepartment}
        currentWeekStart={startOfWeek(toIsoDate(new Date()))}
      />
    </div>
  );
}

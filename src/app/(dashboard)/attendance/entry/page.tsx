import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getEmployees } from "@/lib/actions/employee-actions";
import { ManualEntryForm } from "@/components/attendance/manual-entry-form";

export default async function AttendanceEntryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!["super_admin", "hr_admin"].includes(user.role)) {
    redirect("/attendance");
  }

  const employees = await getEmployees();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Manual Attendance Entry
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manually record attendance for an employee.
        </p>
      </div>
      <ManualEntryForm
        employees={(employees ?? []).filter((e) => e.status === "active")}
      />
    </div>
  );
}

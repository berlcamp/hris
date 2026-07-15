import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getEmployees } from "@/lib/actions/employee-actions";
import { getAttendanceEntryForEdit } from "@/lib/actions/attendance-actions";
import { getSchedules } from "@/lib/actions/schedule-actions";
import { canManualEntry } from "@/lib/auth-helpers";
import { ManualEntryForm } from "@/components/attendance/manual-entry-form";

export default async function AttendanceEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!canManualEntry(user.role)) {
    redirect("/attendance");
  }

  const { id } = await searchParams;
  const [employees, schedules] = await Promise.all([
    getEmployees(),
    getSchedules(),
  ]);
  const entry = id ? await getAttendanceEntryForEdit(id) : null;
  const isEdit = !!entry;

  const initialValues = entry
    ? {
        employeeId: entry.employee_id,
        date: entry.date,
        scheduleId: entry.schedule_id,
        timeInAm: entry.time_in_am,
        timeOutAm: entry.time_out_am,
        timeInPm: entry.time_in_pm,
        timeOutPm: entry.time_out_pm,
        remarks: entry.remarks,
        reasonInAm: entry.reason_in_am,
        reasonOutAm: entry.reason_out_am,
        reasonInPm: entry.reason_in_pm,
        reasonOutPm: entry.reason_out_pm,
      }
    : undefined;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? "Correct Attendance Entry" : "Manual Attendance Entry"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isEdit
            ? "Adjust the recorded times for this employee. Saving overwrites the existing entry."
            : "Manually record attendance for an employee."}
        </p>
      </div>
      <ManualEntryForm
        employees={(employees ?? []).filter((e) => e.status === "active")}
        schedules={schedules}
        initialValues={initialValues}
      />
    </div>
  );
}

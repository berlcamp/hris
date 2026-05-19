import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDepartments } from "@/lib/actions/user-actions";
import { AttendanceReportClient } from "@/components/reports/attendance-report-client";

export default async function AttendanceReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const departments = await getDepartments();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Attendance Report</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Per-employee attendance totals (days present/absent/on leave, tardy
          and undertime minutes, leave-credit conversion) for the selected
          department and date range. Plantilla, active employees only.
        </p>
      </div>
      <AttendanceReportClient departments={departments ?? []} />
    </div>
  );
}

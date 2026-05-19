import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDepartments } from "@/lib/actions/user-actions";
import { AttendanceDeductionsClient } from "@/components/reports/attendance-deductions-client";

export default async function AttendanceDeductionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const departments = await getDepartments();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Attendance VL Deductions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Post the month&apos;s tardy/undertime &rarr; VL conversion to each
          employee&apos;s leave ledger. The action is idempotent: re-running
          for the same month only posts the difference vs. what&apos;s already
          recorded, so manual attendance corrections are picked up
          automatically.
        </p>
      </div>
      <AttendanceDeductionsClient departments={departments ?? []} />
    </div>
  );
}

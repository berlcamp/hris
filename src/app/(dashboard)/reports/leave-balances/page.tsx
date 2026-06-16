import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getLeaveBalancesReport } from "@/lib/actions/leave-actions";
import { LeaveBalancesReportClient } from "@/components/reports/leave-balances-report-client";

export default async function LeaveBalancesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) {
    redirect("/dashboard");
  }

  const { year: yearParam } = await searchParams;
  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

  const report = await getLeaveBalancesReport(year);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leave Balances</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Current leave-credit balances for all active plantilla employees.
          Download as an Excel-compatible file.
        </p>
      </div>

      <LeaveBalancesReportClient report={report} />
    </div>
  );
}

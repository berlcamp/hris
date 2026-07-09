import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDepartments } from "@/lib/actions/user-actions";
import { isAttendanceManager } from "@/lib/auth-helpers";
import { BulkDtrClient } from "@/components/attendance/bulk-dtr-client";

export default async function BulkDtrPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Bulk DTR is attendance-manager only. Department-scoped roles have no
  // attendance access at all.
  if (!isAttendanceManager(user.role)) {
    redirect("/dashboard");
  }

  const departments = await getDepartments();
  const defaultDepartmentId = null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bulk DTR Generator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate printable DTRs for all active employees of a department within
          a date range.
        </p>
      </div>
      <BulkDtrClient
        departments={departments}
        defaultDepartmentId={defaultDepartmentId}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDepartments } from "@/lib/actions/user-actions";
import { isDeptScoped, isCompositeDeptAdminHead } from "@/lib/auth-helpers";
import { BulkDtrClient } from "@/components/attendance/bulk-dtr-client";

export default async function BulkDtrPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdmin = ["super_admin", "hr_admin"].includes(user.role);
  const isComposite = isCompositeDeptAdminHead(user.role);

  if (!isAdmin && !isDeptScoped(user.role)) {
    redirect("/attendance/dtr");
  }

  const allDepartments = await getDepartments();

  // Non-admin, non-composite dept-scoped users can only export their own dept.
  const departments =
    isAdmin || isComposite
      ? allDepartments
      : allDepartments.filter((d) => d.id === user.departmentId);

  const defaultDepartmentId =
    !isAdmin && !isComposite && user.departmentId
      ? user.departmentId
      : null;

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

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { AuditLogViewer } from "@/components/admin/audit-log-viewer";

export default async function AuditLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
        <p className="text-sm text-muted-foreground mt-1">
          System activity log for COA compliance. Shows who did what, when, and
          to which record.
        </p>
      </div>
      <AuditLogViewer />
    </div>
  );
}

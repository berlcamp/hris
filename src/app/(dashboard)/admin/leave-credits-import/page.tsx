import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { LeaveCreditsImportClient } from "@/components/admin/leave-credits-import-client";

export default async function LeaveCreditsImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Leave credits CSV import
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set the starting baseline for leave credits per employee, leave type,
          and year. Subsequent monthly accruals are added on top of this
          baseline.
        </p>
      </div>
      <LeaveCreditsImportClient />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getIpcrPeriods } from "@/lib/actions/ipcr-actions";
import { IpcrPeriodManager } from "@/components/admin/ipcr-period-manager";

export default async function IpcrPeriodsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const periods = await getIpcrPeriods();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">IPCR Periods</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage Individual Performance Commitment and Review evaluation
          periods.
        </p>
      </div>
      <IpcrPeriodManager periods={periods} />
    </div>
  );
}

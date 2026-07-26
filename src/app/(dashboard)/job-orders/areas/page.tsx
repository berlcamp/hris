import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { getJobOrderAreas } from "@/lib/actions/job-order-area-actions";
import { JobOrderAreaManager } from "@/components/job-orders/job-order-area-manager";

export default async function JobOrderAreasPage() {
  const user = await getServerUser();
  if (!canManageJobOrders(user?.role)) redirect("/dashboard");

  const areas = await getJobOrderAreas({ includeInactive: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Area Assignments
        </h1>
        <p className="text-muted-foreground text-sm">
          Offices and locations Job Order personnel are assigned to.
        </p>
      </div>
      <JobOrderAreaManager initialAreas={areas} />
    </div>
  );
}

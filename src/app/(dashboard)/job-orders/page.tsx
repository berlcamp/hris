import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { getJobOrderEmployees } from "@/lib/actions/job-order-actions";
import { getJobOrderAreas } from "@/lib/actions/job-order-area-actions";
import { JobOrderListClient } from "@/components/job-orders/job-order-list-client";

export default async function JobOrdersPage() {
  const user = await getServerUser();
  if (!canManageJobOrders(user?.role)) redirect("/dashboard");

  const [employees, areas] = await Promise.all([
    getJobOrderEmployees({ status: "all" }),
    getJobOrderAreas({ includeInactive: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Job Order Employees
        </h1>
        <p className="text-muted-foreground text-sm">
          Daily-wage Job Order personnel, their area assignments, and payout
          details.
        </p>
      </div>
      <JobOrderListClient
        initialEmployees={employees}
        areas={areas}
        isSuperAdmin={user?.role === "super_admin"}
      />
    </div>
  );
}

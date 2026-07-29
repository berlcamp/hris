import { redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { canManageJobOrders } from "@/lib/auth-helpers";
import {
  getJobOrderAreasForPicker,
  getJobOrderPayrolls,
} from "@/lib/actions/job-order-payroll-actions";
import { JobOrderPayrollListClient } from "@/components/job-orders/payroll/job-order-payroll-list-client";

export default async function JobOrderPayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getServerUser();
  if (!canManageJobOrders(user?.role)) redirect("/dashboard");

  // Next 16: searchParams is async — await before destructuring.
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);

  const page = Number(one("page") ?? "1") || 1;
  const status = (one("status") ?? "all") as "all" | "draft" | "finalized";

  const [{ rows, totalCount }, areas] = await Promise.all([
    getJobOrderPayrolls({
      page,
      status,
      periodFrom: one("from") ?? null,
      periodTo: one("to") ?? null,
      search: one("q") ?? null,
    }),
    getJobOrderAreasForPicker(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Job Order Payroll
        </h1>
        <p className="text-muted-foreground text-sm">
          Payroll runs for Job Order personnel, grouped by period and area.
        </p>
      </div>
      <JobOrderPayrollListClient
        payrolls={rows}
        totalCount={totalCount}
        page={page}
        areas={areas}
        canDelete={user?.role === "super_admin"}
      />
    </div>
  );
}

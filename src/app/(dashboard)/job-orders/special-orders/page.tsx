import { redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { getJobOrderSpecialOrders } from "@/lib/actions/job-order-special-order-actions";
import { JOB_ORDER_SPECIAL_ORDER_PAGE_SIZE } from "@/lib/job-order-special-order-repo";
import { JobOrderSpecialOrderListClient } from "@/components/job-orders/special-orders/job-order-special-order-list-client";

export default async function JobOrderSpecialOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getServerUser();
  if (!canManageJobOrders(user?.roles)) redirect("/dashboard");

  // Next 16: searchParams is async — await before destructuring.
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);

  const page = Number(one("page") ?? "1") || 1;

  const { rows, totalCount } = await getJobOrderSpecialOrders({
    page,
    dateFrom: one("from") ?? null,
    dateTo: one("to") ?? null,
    search: one("q") ?? null,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Special Orders</h1>
        <p className="text-muted-foreground text-sm">
          Orders directing Job Order personnel to render additional time
          services.
        </p>
      </div>
      <JobOrderSpecialOrderListClient
        specialOrders={rows}
        totalCount={totalCount}
        page={page}
        pageSize={JOB_ORDER_SPECIAL_ORDER_PAGE_SIZE}
        canEdit={canManageJobOrders(user?.roles)}
      />
    </div>
  );
}

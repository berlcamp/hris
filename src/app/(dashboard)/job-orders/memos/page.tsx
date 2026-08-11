import { redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { getJobOrderMemos } from "@/lib/actions/job-order-memo-actions";
import { JOB_ORDER_MEMO_PAGE_SIZE } from "@/lib/job-order-memo-repo";
import { JobOrderMemoListClient } from "@/components/job-orders/memos/job-order-memo-list-client";

export default async function JobOrderMemosPage({
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
  const type = (one("type") ?? "all") as "all" | "new" | "retain";

  const { rows, totalCount } = await getJobOrderMemos({
    page,
    type,
    dateFrom: one("from") ?? null,
    dateTo: one("to") ?? null,
    search: one("q") ?? null,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Memorandum</h1>
        <p className="text-muted-foreground text-sm">
          Memoranda covering Job Order personnel — new contracts and extensions.
        </p>
      </div>
      <JobOrderMemoListClient
        memos={rows}
        totalCount={totalCount}
        page={page}
        pageSize={JOB_ORDER_MEMO_PAGE_SIZE}
        canEdit={canManageJobOrders(user?.role)}
      />
    </div>
  );
}

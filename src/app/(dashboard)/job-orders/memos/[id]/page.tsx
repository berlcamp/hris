import { notFound, redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { getJobOrderMemoById } from "@/lib/actions/job-order-memo-actions";
import { JobOrderMemoDetailClient } from "@/components/job-orders/memos/job-order-memo-detail-client";

export default async function JobOrderMemoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getServerUser();
  if (!canManageJobOrders(user?.role)) redirect("/dashboard");

  // Next 16: params is async — await before destructuring.
  const { id } = await params;
  const { memo, members } = await getJobOrderMemoById(id);
  if (!memo) notFound();

  return (
    <JobOrderMemoDetailClient
      memo={memo}
      members={members}
      canEdit={canManageJobOrders(user?.role)}
    />
  );
}

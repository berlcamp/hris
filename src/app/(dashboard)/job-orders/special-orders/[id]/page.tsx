import { notFound, redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { getJobOrderSpecialOrderById } from "@/lib/actions/job-order-special-order-actions";
import { JobOrderSpecialOrderDetailClient } from "@/components/job-orders/special-orders/job-order-special-order-detail-client";

export default async function JobOrderSpecialOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getServerUser();
  if (!canManageJobOrders(user?.roles)) redirect("/dashboard");

  // Next 16: params is async — await before destructuring.
  const { id } = await params;
  const { specialOrder, members } = await getJobOrderSpecialOrderById(id);
  if (!specialOrder) notFound();

  return (
    <JobOrderSpecialOrderDetailClient
      specialOrder={specialOrder}
      members={members}
      canEdit={canManageJobOrders(user?.roles)}
    />
  );
}

import { notFound, redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import {
  canManageJobOrderPayroll,
  canManageJobOrders,
} from "@/lib/auth-helpers";
import { getJobOrderPayrollById } from "@/lib/actions/job-order-payroll-actions";
import { JobOrderPayrollDetailClient } from "@/components/job-orders/payroll/job-order-payroll-detail-client";

export default async function JobOrderPayrollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getServerUser();
  if (!canManageJobOrders(user?.role)) redirect("/dashboard");

  // Next 16: params is async — await before destructuring.
  const { id } = await params;
  const { payroll, members } = await getJobOrderPayrollById(id);
  if (!payroll) notFound();

  return (
    <JobOrderPayrollDetailClient
      payroll={payroll}
      members={members}
      isSuperAdmin={user?.role === "super_admin"}
      canEdit={canManageJobOrderPayroll({
        role: user?.role,
        canManageModulePayroll: user?.canManageModulePayroll,
      })}
    />
  );
}

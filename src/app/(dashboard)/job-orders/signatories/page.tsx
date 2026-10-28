import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { getJobOrderSignatories } from "@/lib/actions/job-order-signatory-actions";
import { JobOrderSignatoriesForm } from "@/components/job-orders/job-order-signatories-form";

export default async function JobOrderSignatoriesPage() {
  const user = await getServerUser();
  if (!canManageJobOrders(user?.roles)) redirect("/dashboard");

  const signatories = await getJobOrderSignatories();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Signatories</h1>
        <p className="text-muted-foreground text-sm">
          Names and positions printed on the Job Order memoranda, special
          orders, payroll, OBR and SSS contribution list.
        </p>
      </div>
      <JobOrderSignatoriesForm signatories={signatories} />
    </div>
  );
}

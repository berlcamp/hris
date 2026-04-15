import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getEmployees } from "@/lib/actions/employee-actions";
import { getActivePeriod } from "@/lib/actions/ipcr-actions";
import { IpcrForm } from "@/components/performance/ipcr-form";

export default async function NewIpcrPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!["super_admin", "hr_admin", "department_head"].includes(user.role)) {
    redirect("/performance");
  }

  const [employees, activePeriod] = await Promise.all([
    getEmployees(),
    getActivePeriod(),
  ]);

  if (!activePeriod) {
    redirect("/performance");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          New IPCR Record
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create an Individual Performance Commitment and Review record.
        </p>
      </div>
      <IpcrForm
        employees={(employees ?? []).filter((e) => e.status === "active")}
        activePeriod={activePeriod}
      />
    </div>
  );
}

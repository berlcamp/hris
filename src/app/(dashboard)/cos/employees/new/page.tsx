import { redirect } from "next/navigation";
import { CosEmployeeForm } from "@/components/cos/cos-employee-form";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { getDepartments } from "@/lib/actions/user-actions";

export default async function NewCosEmployeePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCos(user.role)) redirect("/dashboard");

  const departments = await getDepartments();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          New COS Employee
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Encode a Contract of Service employee. Contracts are issued from the
          employee&apos;s profile once the record exists.
        </p>
      </div>
      <CosEmployeeForm mode="create" departments={departments ?? []} />
    </div>
  );
}

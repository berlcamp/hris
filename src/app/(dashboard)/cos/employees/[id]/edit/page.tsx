import { notFound, redirect } from "next/navigation";
import { CosEmployeeForm } from "@/components/cos/cos-employee-form";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { getCosEmployee } from "@/lib/actions/cos-employee-actions";
import { getDepartments } from "@/lib/actions/user-actions";
import { formatCosEmployeeName } from "@/lib/cos-constants";

export default async function EditCosEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCos(user.role)) redirect("/dashboard");

  const [employee, departments] = await Promise.all([
    getCosEmployee(id),
    getDepartments(),
  ]);
  if (!employee) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Edit {formatCosEmployeeName(employee)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          COS No. {employee.cos_no}
        </p>
      </div>
      <CosEmployeeForm
        mode="edit"
        departments={departments ?? []}
        employee={employee}
      />
    </div>
  );
}

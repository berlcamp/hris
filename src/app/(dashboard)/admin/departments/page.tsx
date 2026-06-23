import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDepartmentsWithDetails } from "@/lib/actions/department-actions";
import { DepartmentManager } from "@/components/admin/department-manager";

export default async function DepartmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "ocm_admin", "dtr_manager"].includes(user.role))
    redirect("/dashboard");

  const departments = await getDepartmentsWithDetails();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Departments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage departments and their heads. These drive employee assignment
          and the DTR signatory block.
        </p>
      </div>
      <DepartmentManager departments={departments} />
    </div>
  );
}

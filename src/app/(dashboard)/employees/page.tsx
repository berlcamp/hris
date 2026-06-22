import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getEmployees, getEmployeeForCurrentUser } from "@/lib/actions/employee-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDepartments } from "@/lib/actions/user-actions";
import { EmployeesTable } from "@/components/employees/employees-table";

export default async function EmployeesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Employees with role "employee" get redirected to their own profile
  if (user.role === "employee") {
    const emp = await getEmployeeForCurrentUser();
    if (emp) redirect(`/employees/${emp.id}`);
    redirect("/dashboard");
  }

  const [employees, departments] = await Promise.all([
    getEmployees(),
    getDepartments(),
  ]);

  const departmentOptions = (departments ?? []).map((d) => ({
    label: d.name,
    value: d.id,
  }));

  const canCreate = ["super_admin", "hr_admin"].includes(user.role);
  // OCM Admin can detail employees from any department, so it doesn't require a
  // home department; department-scoped editors still do.
  const canEditDetailedDeptAnyDept = user.role === "ocm_admin";
  const canEditDetailedDept =
    canEditDetailedDeptAnyDept ||
    (["department_admin", "department_admin_and_department_head"].includes(
      user.role
    ) &&
      !!user.departmentId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage employee records, profiles, and 201 files.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/employees/new"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Employee
          </Link>
        )}
      </div>

      <EmployeesTable
        data={employees ?? []}
        departmentOptions={departmentOptions}
        canEdit={canCreate}
        canEditDetailedDept={canEditDetailedDept}
        canEditDetailedDeptAnyDept={canEditDetailedDeptAnyDept}
        userDepartmentId={user.departmentId}
        departments={departments ?? []}
      />
    </div>
  );
}

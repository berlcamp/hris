import { redirect } from "next/navigation";
import { EmployeeForm } from "@/components/forms/employee-form";
import { getDepartments } from "@/lib/actions/user-actions";
import {
  getPositions,
  generateEmployeeNo,
} from "@/lib/actions/employee-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";

export default async function NewEmployeePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/employees");

  const [departments, positions, employeeNo] = await Promise.all([
    getDepartments(),
    getPositions(),
    generateEmployeeNo(),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add New Employee</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new employee record. The employee number will be auto-generated.
        </p>
      </div>

      <EmployeeForm
        departments={departments ?? []}
        positions={positions ?? []}
        mode="create"
        employeeNo={employeeNo}
      />
    </div>
  );
}

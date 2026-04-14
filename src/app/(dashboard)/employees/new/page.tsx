import { EmployeeForm } from "@/components/forms/employee-form";
import { getDepartments } from "@/lib/actions/user-actions";
import {
  getPositions,
  getUnlinkedUserProfiles,
  generateEmployeeNo,
} from "@/lib/actions/employee-actions";

export default async function NewEmployeePage() {
  const [departments, positions, userProfiles, employeeNo] = await Promise.all([
    getDepartments(),
    getPositions(),
    getUnlinkedUserProfiles(),
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
        userProfiles={userProfiles ?? []}
        mode="create"
        employeeNo={employeeNo}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import { EmployeeForm } from "@/components/forms/employee-form";
import { getDepartments } from "@/lib/actions/user-actions";
import {
  getEmployeeById,
  getPositions,
  getUnlinkedUserProfiles,
} from "@/lib/actions/employee-actions";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [employee, departments, positions, userProfiles] = await Promise.all([
    getEmployeeById(id).catch(() => null),
    getDepartments(),
    getPositions(),
    getUnlinkedUserProfiles(),
  ]);

  if (!employee) notFound();

  // Include the current employee's linked profile in the options
  const allProfiles = userProfiles ?? [];
  if (
    employee.user_profile_id &&
    !allProfiles.find((p) => p.id === employee.user_profile_id)
  ) {
    // The profile is already linked to this employee, so it won't be in the "unlinked" list
    // We need to fetch it separately
    allProfiles.unshift({
      id: employee.user_profile_id,
      email: "",
      full_name: `${employee.first_name} ${employee.last_name}`,
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Edit Employee — {employee.first_name} {employee.last_name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update employee information and employment details.
        </p>
      </div>

      <EmployeeForm
        departments={departments ?? []}
        positions={positions ?? []}
        userProfiles={allProfiles}
        mode="edit"
        defaultValues={{
          id: employee.id,
          user_profile_id: employee.user_profile_id,
          first_name: employee.first_name,
          middle_name: employee.middle_name,
          last_name: employee.last_name,
          suffix: employee.suffix,
          birth_date: employee.birth_date,
          gender: employee.gender,
          civil_status: employee.civil_status,
          address: employee.address,
          phone: employee.phone,
          employment_type: employee.employment_type as "plantilla" | "jo" | "cos",
          position_id: employee.position_id,
          department_id: employee.department_id,
          salary_grade: employee.salary_grade,
          step_increment: employee.step_increment,
          hire_date: employee.hire_date,
          end_of_contract: employee.end_of_contract,
        }}
      />
    </div>
  );
}

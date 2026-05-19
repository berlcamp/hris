import { notFound, redirect } from "next/navigation";
import { EmployeeForm } from "@/components/forms/employee-form";
import { getDepartments } from "@/lib/actions/user-actions";
import {
  getEmployeeById,
  getPositions,
} from "@/lib/actions/employee-actions";
import { getSchedules } from "@/lib/actions/schedule-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) {
    redirect(`/employees/${id}`);
  }

  const [employee, departments, positions, schedules] = await Promise.all([
    getEmployeeById(id).catch(() => null),
    getDepartments(),
    getPositions(),
    getSchedules(),
  ]);

  if (!employee) notFound();

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
        schedules={schedules ?? []}
        mode="edit"
        defaultValues={{
          id: employee.id,
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
          schedule_id: employee.schedule_id,
        }}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { NosiForm } from "@/components/nosi/nosi-form";
import { getEmployees, getEmployeeById } from "@/lib/actions/employee-actions";

export default async function NewNosiPage({
  searchParams,
}: {
  searchParams: Promise<{ employee_id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/nosi");

  const { employee_id } = await searchParams;

  const [employees, preselectedEmployee] = await Promise.all([
    getEmployees(),
    employee_id ? getEmployeeById(employee_id).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Generate NOSI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a Notice of Step Increment for an eligible employee.
        </p>
      </div>
      <NosiForm
        employees={(employees ?? []).filter((e) => e.employment_type === "plantilla" && e.status === "active")}
        preselectedEmployeeId={employee_id ?? null}
        preselectedEmployee={preselectedEmployee}
      />
    </div>
  );
}

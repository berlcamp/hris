import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { NosaForm } from "@/components/nosa/nosa-form";
import { getEmployees } from "@/lib/actions/employee-actions";

export default async function NewNosaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/nosa");

  const employees = await getEmployees();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create NOSA</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a Notice of Salary Adjustment for an employee.
        </p>
      </div>
      <NosaForm
        employees={(employees ?? []).filter((e) => e.status === "active")}
      />
    </div>
  );
}

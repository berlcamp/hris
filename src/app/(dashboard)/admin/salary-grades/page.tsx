import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getSalaryGrades, getDistinctTranches } from "@/lib/actions/salary-grade-actions";
import { SalaryGradeManager } from "@/components/admin/salary-grade-manager";

export default async function SalaryGradesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/dashboard");

  const [grades, tranches] = await Promise.all([
    getSalaryGrades(),
    getDistinctTranches(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Salary Grade Table</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the Salary Standardization Law (SSL) reference table used for NOSI and NOSA computations.
        </p>
      </div>
      <SalaryGradeManager
        initialGrades={grades ?? []}
        tranches={tranches ?? []}
      />
    </div>
  );
}

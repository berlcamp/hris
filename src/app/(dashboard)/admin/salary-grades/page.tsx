import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageHrRecords, canManageSalaryGrades } from "@/lib/auth-helpers";
import { getSalaryGrades, getDistinctTranches } from "@/lib/actions/salary-grade-actions";
import { SalaryGradeManager } from "@/components/admin/salary-grade-manager";

export default async function SalaryGradesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageHrRecords(user.role)) redirect("/dashboard");

  // The HR Record Manager may reach this page but only to view — editing the
  // table stays with super_admin / hr_admin.
  const readOnly = !canManageSalaryGrades(user.role);

  const [grades, tranches] = await Promise.all([
    getSalaryGrades(),
    getDistinctTranches(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Salary Grade Table</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {readOnly
            ? "View the Salary Standardization Law (SSL) reference table used for NOSI and NOSA computations."
            : "Manage the Salary Standardization Law (SSL) reference table used for NOSI and NOSA computations."}
        </p>
      </div>
      <SalaryGradeManager
        initialGrades={grades ?? []}
        tranches={tranches ?? []}
        readOnly={readOnly}
      />
    </div>
  );
}

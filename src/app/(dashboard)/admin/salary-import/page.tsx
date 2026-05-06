import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { SalaryImportClient } from "@/components/admin/salary-import-client";

export default async function SalaryImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Salary CSV import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Load the SSL grade/step matrix and sync employee SG/step plus salary history for NOSI.
        </p>
      </div>
      <SalaryImportClient />
    </div>
  );
}

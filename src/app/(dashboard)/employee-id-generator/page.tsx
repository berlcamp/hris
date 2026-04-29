import { redirect } from "next/navigation";
import { ScanSearch } from "lucide-react";

import { getCurrentUser } from "@/lib/actions/auth-actions";
import { EmployeeIdGeneratorClient } from "@/components/employee-id-generator/employee-id-generator-client";

export default async function EmployeeIdGeneratorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!["super_admin", "hr_admin", "department_head"].includes(user.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ScanSearch className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employee ID Generator</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload a CSC CSV (full name column only) to resolve HRIS employee ids.
          </p>
        </div>
      </div>

      <EmployeeIdGeneratorClient />
    </div>
  );
}

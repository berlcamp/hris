import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getEmployees } from "@/lib/actions/employee-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { DtrViewClient } from "@/components/attendance/dtr-view-client";

export default async function DtrPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const employees = await getEmployees();
  const isAdmin = ["super_admin", "hr_admin"].includes(user.role);

  // If user is an employee, find their employee record
  let currentEmployeeId: string | null = null;
  if (user.role === "employee") {
    const supabase = createAdminClient();
    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("user_profile_id", user.id)
      .maybeSingle();
    currentEmployeeId = emp?.id ?? null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Daily Time Record (DTR)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          View monthly DTR, generate CSC-format PDF, and export summary reports.
        </p>
      </div>
      <DtrViewClient
        employees={(employees ?? []).filter((e) => e.status === "active")}
        isAdmin={isAdmin}
        currentEmployeeId={currentEmployeeId}
      />
    </div>
  );
}

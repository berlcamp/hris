import Link from "next/link";
import { Printer } from "lucide-react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getEmployees } from "@/lib/actions/employee-actions";
import { canAccessAttendance, canPrintDtr } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { IndividualDtrClient } from "@/components/attendance/individual-dtr-client";

export default async function DtrPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessAttendance(user.role)) redirect("/dashboard");

  const employees = await getEmployees();
  const isAdmin = canPrintDtr(user.role);
  const canBulkDtr = isAdmin;

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Individual DTR</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate a printable CSC Form 48 DTR for a single employee within a
            date range.
          </p>
        </div>
        {canBulkDtr && (
          <Link href="/attendance/dtr/bulk">
            <Button variant="outline" size="sm">
              <Printer className="h-4 w-4" />
              Bulk DTR by Department
            </Button>
          </Link>
        )}
      </div>
      <IndividualDtrClient
        employees={(employees ?? []).filter(
          (e) => e.status === "active" && e.employment_type === "plantilla",
        )}
        isAdmin={isAdmin}
        currentEmployeeId={currentEmployeeId}
      />
    </div>
  );
}

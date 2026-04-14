import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getEmployees } from "@/lib/actions/employee-actions";
import { getLeaveTypes } from "@/lib/actions/leave-actions";
import { LeaveApplicationForm } from "@/components/leaves/leave-application-form";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function LeaveApplyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [employees, leaveTypes] = await Promise.all([
    getEmployees(),
    getLeaveTypes(),
  ]);

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

  const isEmployee = user.role === "employee";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Apply for Leave</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Submit a leave application for review and approval.
        </p>
      </div>
      <LeaveApplicationForm
        employees={(employees ?? []).filter((e) => e.status === "active")}
        leaveTypes={leaveTypes}
        currentEmployeeId={currentEmployeeId}
        isEmployee={isEmployee}
      />
    </div>
  );
}

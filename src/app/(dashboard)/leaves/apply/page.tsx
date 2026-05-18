import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getEmployees, type EmployeeWithRelations } from "@/lib/actions/employee-actions";
import { getLeaveTypes } from "@/lib/actions/leave-actions";
import { LeaveApplicationForm } from "@/components/leaves/leave-application-form";
import { isCompositeDeptAdminHead, isDeptHead } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function LeaveApplyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // The composite Dept Admin + Head role can file leave for any employee
  // in any department, so it bypasses getEmployees()'s dept scoping.
  const employeesPromise: Promise<EmployeeWithRelations[]> =
    isCompositeDeptAdminHead(user.role)
      ? (async () => {
          const supabase = createAdminClient();
          const { data } = await supabase
            .schema("hris")
            .from("employees")
            .select(
              "*, departments!employees_department_id_fkey(name, code), positions(title, item_number), plantilla(position_title, item_number)",
            )
            .order("last_name");
          return (data ?? []) as EmployeeWithRelations[];
        })()
      : getEmployees();

  const [employees, leaveTypes] = await Promise.all([
    employeesPromise,
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

  // Department Admins can only file leave for plantilla employees of their department.
  // getEmployees() already scopes to the user's department for department_admin/_head.
  // The composite dept_admin+head role takes the dept_head treatment (no plantilla restriction).
  const restrictToPlantilla =
    user.role === "department_admin" && !isDeptHead(user.role);
  const formEmployees = (employees ?? [])
    .filter((e) => e.status === "active")
    .filter((e) => (restrictToPlantilla ? e.employment_type === "plantilla" : true));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Apply for Leave</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Submit a leave application for review and approval.
        </p>
      </div>
      <LeaveApplicationForm
        employees={formEmployees}
        leaveTypes={leaveTypes}
        currentEmployeeId={currentEmployeeId}
        isEmployee={isEmployee}
      />
    </div>
  );
}

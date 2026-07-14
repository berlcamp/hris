import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getEmployees, type EmployeeWithRelations } from "@/lib/actions/employee-actions";
import { getHolidays } from "@/lib/actions/holiday-actions";
import { CtoApplicationForm } from "@/components/cto/cto-application-form";
import { isCompositeDeptAdminHead, isDeptHead } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function CtoApplyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // The composite Dept Admin + Head role can file CTO for any employee
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

  const [employees, holidays] = await Promise.all([
    employeesPromise,
    getHolidays(),
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

  // Department Admins can only file CTO for plantilla employees of their
  // department (mirrors the leave apply page).
  const restrictToPlantilla =
    user.role === "department_admin" && !isDeptHead(user.role);
  const formEmployees = (employees ?? [])
    .filter((e) => e.status === "active")
    .filter((e) => (restrictToPlantilla ? e.employment_type === "plantilla" : true));

  const fullHolidayDates = holidays
    .filter((h) => h.type === "full")
    .map((h) => h.date);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Apply for CTO</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Avail Compensatory Time-Off against earned Compensatory Overtime
          Credits (COC).
        </p>
      </div>
      <CtoApplicationForm
        employees={formEmployees}
        currentEmployeeId={currentEmployeeId}
        isEmployee={isEmployee}
        fullHolidayDates={fullHolidayDates}
      />
    </div>
  );
}

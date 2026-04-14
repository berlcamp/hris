import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { employeeColumns } from "@/components/tables/columns/employee-columns";
import { getEmployees, getEmployeeForCurrentUser } from "@/lib/actions/employee-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDepartments } from "@/lib/actions/user-actions";
import { ExportCsvButton } from "@/components/tables/export-csv-button";

export default async function EmployeesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Employees with role "employee" get redirected to their own profile
  if (user.role === "employee") {
    const emp = await getEmployeeForCurrentUser();
    if (emp) redirect(`/employees/${emp.id}`);
    redirect("/dashboard");
  }

  const [employees, departments] = await Promise.all([
    getEmployees(),
    getDepartments(),
  ]);

  const departmentOptions = (departments ?? []).map((d) => ({
    label: d.name,
    value: d.id,
  }));

  const canCreate = ["super_admin", "hr_admin"].includes(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage employee records, profiles, and 201 files.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/employees/new"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Employee
          </Link>
        )}
      </div>

      <DataTable
        columns={employeeColumns}
        data={employees ?? []}
        searchableColumns={[
          { id: "employee_no", title: "employee no" },
          { id: "full_name", title: "name" },
        ]}
        filterableColumns={[
          {
            id: "department",
            title: "Department",
            options: departmentOptions,
          },
          {
            id: "employment_type",
            title: "Type",
            options: [
              { label: "Plantilla", value: "plantilla" },
              { label: "Job Order", value: "jo" },
              { label: "Contract of Service", value: "cos" },
            ],
          },
          {
            id: "status",
            title: "Status",
            options: [
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
              { label: "Retired", value: "retired" },
              { label: "Terminated", value: "terminated" },
              { label: "Resigned", value: "resigned" },
            ],
          },
        ]}
        toolbar={
          <ExportCsvButton
            data={employees ?? []}
            filename="employees"
            columns={[
              { key: "employee_no", header: "Employee No" },
              { key: "last_name", header: "Last Name" },
              { key: "first_name", header: "First Name" },
              { key: "middle_name", header: "Middle Name" },
              { key: "employment_type", header: "Employment Type" },
              { key: "status", header: "Status" },
            ]}
          />
        }
      />
    </div>
  );
}

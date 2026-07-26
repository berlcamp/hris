import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CosEmployeeListClient } from "@/components/cos/cos-employee-list-client";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { getCosEmployees } from "@/lib/actions/cos-employee-actions";

export default async function CosEmployeesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCos(user.role)) redirect("/dashboard");

  const employees = await getCosEmployees();

  const total = employees.length;
  const active = employees.filter((e) => e.status === "active").length;
  const inactive = total - active;

  // Filter options are department NAMES because that is what the column's
  // accessorFn returns and what the faceted filter compares against.
  const departmentOptions = Array.from(
    new Set(
      employees
        .map((e) => e.departments?.name)
        .filter((n): n is string => !!n),
    ),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ label: name, value: name }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">COS Employees</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Contract of Service personnel. Each employee holds a contract history;
          renewals add new contracts without overwriting earlier ones.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total", value: total },
          { label: "Active", value: active },
          { label: "Inactive", value: inactive },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">No COS employees yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              The registry starts empty. Use “Add COS Employee” to encode the
              first record.
            </p>
            {canManageCos(user.role) ? (
              <Link href="/cos/employees/new" className="mt-4 inline-block">
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Add COS Employee
                </Button>
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <CosEmployeeListClient
          employees={employees}
          departmentOptions={departmentOptions}
          canCreate={canManageCos(user.role)}
          canDelete={user.role === "super_admin"}
        />
      )}
    </div>
  );
}

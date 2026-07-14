import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { ctoCreditColumns } from "@/components/tables/columns/cto-credit-columns";
import { CtoCreditEntryDialog } from "@/components/cto/cto-credit-entry-dialog";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getCtoBalancesReport } from "@/lib/actions/cto-actions";
import { getEmployees } from "@/lib/actions/employee-actions";
import { getHolidays } from "@/lib/actions/holiday-actions";
import { getDepartments } from "@/lib/actions/user-actions";

export default async function CtoCreditsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) {
    redirect("/dashboard");
  }

  const [report, employees, holidays, departments] = await Promise.all([
    getCtoBalancesReport(),
    getEmployees(),
    getHolidays(),
    getDepartments(),
  ]);

  const rows = "error" in report ? [] : report;
  const activeEmployees = (employees ?? [])
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, first_name: e.first_name, last_name: e.last_name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/cto">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">COC Credits</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Record Compensatory Overtime Credits earned from authorized
              overtime and track balances, expiry, and forfeiture.
            </p>
          </div>
        </div>
        <CtoCreditEntryDialog
          employees={activeEmployees}
          holidayDates={holidays.map((h) => h.date)}
        />
      </div>

      <DataTable
        columns={ctoCreditColumns}
        data={rows}
        initialColumnVisibility={{ department: false }}
        filterableColumns={[
          {
            id: "department",
            title: "Department",
            options: departments.map((d) => ({
              label: d.code ? `${d.code} — ${d.name}` : d.name,
              value: d.code ?? "",
            })),
          },
        ]}
        searchableColumns={[{ id: "employee", title: "employee" }]}
      />
    </div>
  );
}

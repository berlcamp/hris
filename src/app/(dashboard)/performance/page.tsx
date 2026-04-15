import Link from "next/link";
import { Plus, CalendarCog } from "lucide-react";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/tables/data-table";
import { ipcrColumns } from "@/components/tables/columns/ipcr-columns";
import { getIpcrRecords, getActivePeriod } from "@/lib/actions/ipcr-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";

export default async function PerformancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const activePeriod = await getActivePeriod();
  const records = await getIpcrRecords(activePeriod?.id);

  const isAdmin = ["super_admin", "hr_admin"].includes(user.role);
  const canCreate = ["super_admin", "hr_admin", "department_head"].includes(
    user.role
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Performance Management (IPCR)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Individual Performance Commitment and Review records.
            {activePeriod && (
              <>
                {" "}Active period:{" "}
                <Badge variant="secondary" className="ml-1">
                  {activePeriod.name}
                </Badge>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Link href="/admin/ipcr-periods">
              <Button variant="outline" size="sm">
                <CalendarCog className="h-4 w-4" />
                Manage Periods
              </Button>
            </Link>
          )}
          {canCreate && activePeriod && (
            <Link href="/performance/new">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                New IPCR Record
              </Button>
            </Link>
          )}
        </div>
      </div>

      {!activePeriod ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <CalendarCog className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">No active IPCR period.</p>
          {isAdmin && (
            <Link href="/admin/ipcr-periods" className="mt-2">
              <Button variant="outline" size="sm">
                Set Up Period
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <DataTable
          columns={ipcrColumns}
          data={records}
          filterableColumns={[
            {
              id: "status",
              title: "Status",
              options: [
                { label: "Draft", value: "draft" },
                { label: "Pending", value: "pending" },
                { label: "Approved", value: "approved" },
                { label: "Rejected", value: "rejected" },
              ],
            },
            {
              id: "adjectival",
              title: "Rating",
              options: [
                { label: "Outstanding", value: "Outstanding" },
                { label: "Very Satisfactory", value: "Very Satisfactory" },
                { label: "Satisfactory", value: "Satisfactory" },
                { label: "Unsatisfactory", value: "Unsatisfactory" },
                { label: "Poor", value: "Poor" },
              ],
            },
          ]}
          searchableColumns={[{ id: "employee", title: "employee" }]}
        />
      )}
    </div>
  );
}

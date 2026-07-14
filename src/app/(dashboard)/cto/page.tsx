import Link from "next/link";
import { Plus, Hourglass } from "lucide-react";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { ctoColumns } from "@/components/tables/columns/cto-columns";
import { getCtoApplications } from "@/lib/actions/cto-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDepartments } from "@/lib/actions/user-actions";

export default async function CtoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [applications, departments] = await Promise.all([
    getCtoApplications(),
    getDepartments(),
  ]);

  const canManageCredits = ["super_admin", "hr_admin"].includes(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CTO Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Apply for Compensatory Time-Off against earned overtime credits
            (COC) and manage approvals.
          </p>
        </div>
        <div className="flex gap-2">
          {canManageCredits && (
            <Link href="/cto/credits">
              <Button variant="outline" size="sm">
                <Hourglass className="h-4 w-4" />
                COC Credits
              </Button>
            </Link>
          )}
          <Link href="/cto/apply">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Apply for CTO
            </Button>
          </Link>
        </div>
      </div>

      <DataTable
        columns={ctoColumns}
        data={applications}
        initialColumnVisibility={{ department: false, created_by: false }}
        filterableColumns={[
          {
            id: "created_by",
            title: "Created By",
            options: [{ label: "Me", value: user.id }],
          },
          {
            id: "department",
            title: "Department",
            options: departments.map((d) => ({
              label: d.code ? `${d.code} — ${d.name}` : d.name,
              value: d.code ?? "",
            })),
          },
          {
            id: "status",
            title: "Status",
            options: [
              { label: "Pending", value: "pending" },
              { label: "Approved", value: "approved" },
              { label: "Rejected", value: "rejected" },
              { label: "Cancelled", value: "cancelled" },
            ],
          },
        ]}
        searchableColumns={[{ id: "employee", title: "employee" }]}
      />
    </div>
  );
}

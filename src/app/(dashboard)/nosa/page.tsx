import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { DataTable } from "@/components/tables/data-table";
import { nosaColumns } from "@/components/tables/columns/nosa-columns";
import { getNosaRecords } from "@/lib/actions/nosa-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";

export default async function NosaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "employee") redirect("/dashboard");

  const records = await getNosaRecords();
  const canCreate = ["super_admin", "hr_admin"].includes(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NOSA</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Notice of Salary Adjustment — manage salary grade changes for promotions, reclassifications, and adjustments.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/nosa/new"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create NOSA
          </Link>
        )}
      </div>

      <DataTable
        columns={nosaColumns}
        data={records ?? []}
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
            id: "reason",
            title: "Reason",
            options: [
              { label: "Promotion", value: "promotion" },
              { label: "Reclassification", value: "reclassification" },
              { label: "Salary Standardization", value: "salary_standardization" },
              { label: "Adjustment", value: "adjustment" },
            ],
          },
        ]}
        searchableColumns={[{ id: "employee", title: "employee" }]}
      />
    </div>
  );
}

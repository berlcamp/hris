import Link from "next/link";
import { Plus, CreditCard } from "lucide-react";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { leaveColumns } from "@/components/tables/columns/leave-columns";
import { getLeaveApplications } from "@/lib/actions/leave-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";

export default async function LeavesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const applications = await getLeaveApplications();

  const isAdmin = ["super_admin", "hr_admin"].includes(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leave Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Apply for leave, track applications, and manage approvals.
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Link href="/leaves/credits">
              <Button variant="outline" size="sm">
                <CreditCard className="h-4 w-4" />
                Leave Credits
              </Button>
            </Link>
          )}
          <Link href="/leaves/apply">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Apply for Leave
            </Button>
          </Link>
        </div>
      </div>

      <DataTable
        columns={leaveColumns}
        data={applications}
        filterableColumns={[
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
          {
            id: "leave_type",
            title: "Leave Type",
            options: [
              { label: "Vacation Leave", value: "VL" },
              { label: "Sick Leave", value: "SL" },
              { label: "Maternity Leave", value: "ML" },
              { label: "Paternity Leave", value: "PL" },
              { label: "Special Privilege", value: "SPL" },
              { label: "Forced Leave", value: "FL" },
            ],
          },
        ]}
        searchableColumns={[{ id: "employee", title: "employee" }]}
      />
    </div>
  );
}

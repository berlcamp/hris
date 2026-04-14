import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { userColumns } from "@/components/tables/columns/user-columns";
import { getUsers } from "@/lib/actions/user-actions";

export default async function UsersPage() {
  const users = await getUsers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage system access by adding, editing, or deactivating users.
          </p>
        </div>
        <Link href="/admin/users/new" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Add User
        </Link>
      </div>

      <DataTable
        columns={userColumns}
        data={users ?? []}
        searchableColumns={[
          { id: "full_name", title: "name" },
          { id: "email", title: "email" },
        ]}
        filterableColumns={[
          {
            id: "role",
            title: "Role",
            options: [
              { label: "Super Admin", value: "super_admin" },
              { label: "HR Admin", value: "hr_admin" },
              { label: "Dept Head", value: "department_head" },
              { label: "Employee", value: "employee" },
            ],
          },
          {
            id: "is_active",
            title: "Status",
            options: [
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ],
          },
        ]}
      />
    </div>
  );
}

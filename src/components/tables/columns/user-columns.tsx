"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { UserActionsCell } from "./user-actions-cell";

export type UserRow = {
  id: string;
  email: string;
  full_name: string;
  /** Derived primary role — kept for rows written before migration 087. */
  role: string;
  /** Every role the account holds. Source of truth for the badges below. */
  roles: string[] | null;
  is_active: boolean;
  department_id: string | null;
  created_at: string | null;
  departments: { name: string; code: string } | null;
};

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  ocm_admin: "OCM Admin",
  hr_admin: "HR Admin",
  hr_record_manager: "HR Record Manager",
  department_head: "Dept Head",
  department_admin: "Dept Admin",
  department_admin_and_department_head: "Dept Admin + Head",
  dtr_manager: "DTR Manager",
  cos_manager: "COS Manager",
  jo_manager: "JO Manager",
  event_attendance_officer: "Attendance Checker",
  employee: "Employee",
};

const roleBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
  super_admin: "default",
  ocm_admin: "secondary",
  hr_admin: "secondary",
  hr_record_manager: "secondary",
  department_head: "outline",
  department_admin: "outline",
  department_admin_and_department_head: "outline",
  dtr_manager: "secondary",
  cos_manager: "secondary",
  jo_manager: "secondary",
  event_attendance_officer: "secondary",
  employee: "outline",
};

export const userColumns: ColumnDef<UserRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "full_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("full_name")}</span>
    ),
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.getValue("email")}</span>
    ),
  },
  {
    id: "roles",
    // An account holds a set of roles (migration 087). The scalar `role` is the
    // derived primary and is only the fallback here, for a row that predates
    // the array.
    accessorFn: (row) => (row.roles?.length ? row.roles : [row.role]),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Roles" />
    ),
    enableSorting: false,
    cell: ({ row }) => {
      const original = row.original;
      const roles = original.roles?.length ? original.roles : [original.role];
      return (
        <div className="flex flex-wrap gap-1">
          {roles.map((role) => (
            <Badge key={role} variant={roleBadgeVariant[role] ?? "outline"}>
              {roleLabels[role] ?? role}
            </Badge>
          ))}
        </div>
      );
    },
    // Matches when the account holds ANY of the selected roles, not only when
    // it is the primary one — filtering for "Dept Head" must find the HR Admin
    // who also heads a department.
    filterFn: (row, id, value: string[]) => {
      const roles = row.getValue(id) as string[];
      return roles.some((role) => value.includes(role));
    },
  },
  {
    id: "department",
    accessorFn: (row) => row.departments?.name ?? "—",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Department" />
    ),
    cell: ({ row }) => {
      const dept = row.original.departments;
      return dept ? (
        <span>
          <span className="font-mono text-xs text-muted-foreground mr-1.5">
            {dept.code}
          </span>
          {dept.name}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: "is_active",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const isActive = row.getValue("is_active") as boolean;
      return (
        <Badge variant={isActive ? "secondary" : "destructive"}>
          {isActive ? "Active" : "Inactive"}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      const isActive = row.getValue(id) as boolean;
      return value.includes(isActive ? "active" : "inactive");
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <UserActionsCell user={row.original} />,
  },
];

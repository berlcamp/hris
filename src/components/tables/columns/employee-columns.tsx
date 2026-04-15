"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { EmployeeActionsCell } from "./employee-actions-cell";

export type EmployeeRow = {
  id: string;
  employee_no: string;
  biometric_no: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  employment_type: string;
  status: string;
  department_id: string | null;
  departments: { name: string; code: string } | null;
  positions: { title: string; item_number: string | null } | null;
};

const employmentTypeLabels: Record<string, string> = {
  plantilla: "Plantilla",
  jo: "Job Order",
  cos: "Contract of Service",
};

const employmentTypeBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
  plantilla: "default",
  jo: "secondary",
  cos: "outline",
};

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "secondary",
  inactive: "destructive",
  retired: "outline",
  terminated: "destructive",
  resigned: "outline",
};

export const employeeColumns: ColumnDef<EmployeeRow>[] = [
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
    accessorKey: "employee_no",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Employee No" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.getValue("employee_no")}</span>
    ),
  },
  {
    accessorKey: "biometric_no",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Biometric No" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.getValue("biometric_no")}</span>
    ),
  },
  {
    id: "full_name",
    accessorFn: (row) => {
      const parts = [row.last_name, row.first_name];
      if (row.suffix) parts[0] = `${row.last_name} ${row.suffix}`;
      if (row.middle_name) parts.push(row.middle_name.charAt(0) + ".");
      return parts.join(", ");
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("full_name")}</span>
    ),
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
    filterFn: (row, id, value) => {
      return value.includes(row.original.department_id);
    },
  },
  {
    id: "position",
    accessorFn: (row) => row.positions?.title ?? "—",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Position" />
    ),
    cell: ({ row }) => {
      const pos = row.original.positions;
      return pos ? (
        <span>{pos.title}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: "employment_type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const type = row.getValue("employment_type") as string;
      return (
        <Badge variant={employmentTypeBadgeVariant[type] ?? "outline"}>
          {employmentTypeLabels[type] ?? type}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge variant={statusBadgeVariant[status] ?? "outline"}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <EmployeeActionsCell employee={row.original} />,
  },
];

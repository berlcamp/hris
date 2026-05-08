"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { EmployeeActionsCell } from "./employee-actions-cell";
import { getEffectivePosition } from "@/lib/employee-position";

export type EmployeeRow = {
  id: string;
  biometric_no: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  employment_type: string;
  status: string;
  department_id: string | null;
  vl_sl_needs_manual_entry: boolean;
  departments: { name: string; code: string } | null;
  positions: { title: string; item_number: string | null } | null;
  plantilla: { position_title: string | null; item_number: string | null }[] | null;
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
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Copy employee ID"
          title="Copy employee ID"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              await navigator.clipboard.writeText(row.original.id);
              toast.success("Employee ID copied");
            } catch {
              toast.error("Could not copy to clipboard");
            }
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Link
          href={`/employees/${row.original.id}`}
          className="min-w-0 font-medium text-primary hover:underline"
        >
          {row.getValue("full_name")}
        </Link>
      </div>
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
    accessorFn: (row) => getEffectivePosition(row) ?? "—",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Position" />
    ),
    cell: ({ row }) => {
      const title = getEffectivePosition(row.original);
      return title ? (
        <span>{title}</span>
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
    id: "vl_sl_status",
    // Manual VL/SL entry only applies to plantilla employees; non-plantilla
    // never count as "missing" so the filter ignores them.
    accessorFn: (row) =>
      row.employment_type === "plantilla" && row.vl_sl_needs_manual_entry
        ? "missing"
        : "ok",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="VL/SL" />
    ),
    cell: ({ row }) =>
      row.original.employment_type === "plantilla" &&
      row.original.vl_sl_needs_manual_entry ? (
        <Badge variant="destructive">Needs entry</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <EmployeeActionsCell employee={row.original} />,
  },
];

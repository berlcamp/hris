"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import type { CosEmployeeWithDepartment } from "@/lib/actions/cos-employee-actions";
import {
  COS_EMPLOYEE_STATUS_LABELS,
  COS_EMPLOYEE_STATUS_VARIANT,
  formatCosEmployeeName,
} from "@/lib/cos-constants";

export const cosEmployeeColumns: ColumnDef<CosEmployeeWithDepartment>[] = [
  {
    accessorKey: "cos_no",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="COS No." />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.cos_no}</span>
    ),
  },
  {
    id: "name",
    // The accessor value drives both sorting and the toolbar search box, so it
    // carries cos_no as well — one input matches either a name or a number.
    // The cell renders the name alone.
    accessorFn: (row) => `${formatCosEmployeeName(row)} ${row.cos_no}`,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <Link
        href={`/cos/employees/${row.original.id}`}
        className="font-medium text-primary hover:underline"
      >
        {formatCosEmployeeName(row.original)}
      </Link>
    ),
  },
  {
    id: "department",
    accessorFn: (row) => row.departments?.name ?? "—",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Office / Department" />
    ),
    // The faceted filter compares against the accessor value, so the filter
    // options must be department NAMES, not ids.
    filterFn: (row, id, value: string[]) =>
      value.includes(row.getValue(id) as string),
  },
  {
    id: "position_title",
    accessorFn: (row) => row.position_title ?? "—",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Position" />
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => (
      <Badge variant={COS_EMPLOYEE_STATUS_VARIANT[row.original.status]}>
        {COS_EMPLOYEE_STATUS_LABELS[row.original.status]}
      </Badge>
    ),
    filterFn: (row, id, value: string[]) =>
      value.includes(row.getValue(id) as string),
  },
];

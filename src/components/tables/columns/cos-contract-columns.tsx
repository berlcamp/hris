"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import type { CosContractWithEmployee } from "@/lib/actions/cos-contract-actions";
import {
  COS_CONTRACT_STATUS_LABELS,
  COS_CONTRACT_STATUS_VARIANT,
  deriveCosContractStatus,
  formatCosEmployeeName,
} from "@/lib/cos-constants";

/** "Jan 1, 2026" without constructing a Date from a bare ISO string. */
function formatDay(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), "MMM d, yyyy");
}

export function cosContractColumns(): ColumnDef<CosContractWithEmployee>[] {
  return [
    {
      id: "employee",
      accessorFn: (row) =>
        row.cos_employees
          ? `${formatCosEmployeeName(row.cos_employees)} ${row.cos_employees.cos_no}`
          : "—",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Employee" />
      ),
      cell: ({ row }) => (
        <Link
          href={`/cos/contracts/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.cos_employees
            ? formatCosEmployeeName(row.original.cos_employees)
            : "—"}
        </Link>
      ),
    },
    {
      id: "department",
      accessorFn: (row) => row.cos_employees?.departments?.name ?? "—",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Department" />
      ),
      filterFn: (row, id, value: string[]) =>
        value.includes(row.getValue(id) as string),
    },
    {
      id: "period",
      accessorFn: (row) => row.period_start,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Period" />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {formatDay(row.original.period_start)} –{" "}
          {formatDay(row.original.period_end)}
        </span>
      ),
    },
    {
      accessorKey: "monthly_rate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Monthly Rate" />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.monthly_rate === null
            ? "—"
            : row.original.monthly_rate.toLocaleString("en-PH", {
                style: "currency",
                currency: "PHP",
                minimumFractionDigits: 2,
              })}
        </span>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => deriveCosContractStatus(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const derived = deriveCosContractStatus(row.original);
        return (
          <Badge variant={COS_CONTRACT_STATUS_VARIANT[derived]}>
            {COS_CONTRACT_STATUS_LABELS[derived]}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) =>
        value.includes(row.getValue(id) as string),
    },
  ];
}

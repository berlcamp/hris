"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { Eye } from "lucide-react";
import type { CtoBalanceReportRow } from "@/lib/actions/cto-actions";

export const ctoCreditColumns: ColumnDef<CtoBalanceReportRow>[] = [
  {
    id: "employee",
    accessorFn: (row) => `${row.last_name}, ${row.first_name}`,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
    cell: ({ row }) => (
      <div className="space-y-0.5">
        <Link
          href={`/cto/credits/${row.original.employee_id}`}
          className="font-medium hover:underline"
        >
          {row.original.last_name}, {row.original.first_name}
        </Link>
        {row.original.department_name && (
          <p className="text-xs text-muted-foreground">
            {row.original.department_code} — {row.original.department_name}
          </p>
        )}
      </div>
    ),
  },
  {
    id: "department",
    accessorFn: (row) => row.department_code ?? "",
    header: () => null,
    cell: () => null,
    filterFn: (row, _id, value: string[]) =>
      value.includes(row.original.department_code ?? ""),
  },
  {
    accessorKey: "total_earned",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total Earned" />,
    cell: ({ row }) => <span className="text-sm">{Number(row.original.total_earned)}h</span>,
  },
  {
    accessorKey: "available",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Available" />,
    cell: ({ row }) => (
      <Badge variant="secondary">{Number(row.original.available)}h</Badge>
    ),
  },
  {
    accessorKey: "expiring_soon",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Expiring ≤30d" />
    ),
    cell: ({ row }) => {
      const v = Number(row.original.expiring_soon);
      return v > 0 ? (
        <span className="text-sm font-medium text-amber-700 dark:text-amber-500">{v}h</span>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: "expired_forfeited",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Forfeited" />
    ),
    cell: ({ row }) => {
      const v = Number(row.original.expired_forfeited);
      return v > 0 ? (
        <span className="text-sm text-muted-foreground">{v}h</span>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <Link href={`/cto/credits/${row.original.employee_id}`}>
        <Button variant="ghost" size="icon-sm">
          <Eye className="h-4 w-4" />
        </Button>
      </Link>
    ),
  },
];

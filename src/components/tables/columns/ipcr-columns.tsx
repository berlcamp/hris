"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { Eye } from "lucide-react";
import { getRatingColor } from "@/lib/ipcr-utils";
import type { IpcrRecordWithRelations } from "@/lib/actions/ipcr-actions";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

export const ipcrColumns: ColumnDef<IpcrRecordWithRelations>[] = [
  {
    id: "employee",
    accessorFn: (row) =>
      row.employees
        ? `${row.employees.last_name}, ${row.employees.first_name}`
        : "—",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Employee" />
    ),
    cell: ({ row }) => {
      const emp = row.original.employees;
      return emp ? (
        <div>
          <p className="font-medium">
            {emp.last_name}, {emp.first_name}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {emp.employee_no}
          </p>
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    id: "department",
    accessorFn: (row) => row.employees?.departments?.name ?? "—",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Department" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.employees?.departments?.name ?? "—"}
      </span>
    ),
    filterFn: (row, id, value) =>
      value.includes(row.original.employees?.departments?.code ?? ""),
  },
  {
    id: "period",
    accessorFn: (row) => row.ipcr_periods?.name ?? "—",
    header: "Period",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.ipcr_periods?.name ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "numerical_rating",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Rating" />
    ),
    cell: ({ row }) => {
      const rating = row.original.numerical_rating;
      return rating !== null ? (
        <span className="font-mono font-medium">{rating.toFixed(2)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    id: "adjectival",
    accessorFn: (row) => row.adjectival_rating ?? "—",
    header: "Adjectival",
    cell: ({ row }) => {
      const adj = row.original.adjectival_rating;
      if (!adj) return <span className="text-muted-foreground">—</span>;
      const colorClass = getRatingColor(adj);
      return (
        <Badge variant="outline" className={`text-xs ${colorClass}`}>
          {adj}
        </Badge>
      );
    },
    filterFn: (row, id, value) =>
      value.includes(row.original.adjectival_rating ?? ""),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const s = row.getValue("status") as string;
      return (
        <Badge variant={statusVariant[s] ?? "outline"}>
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </Badge>
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <Link href={`/performance/${row.original.id}`}>
        <Button variant="ghost" size="icon-sm">
          <Eye className="h-4 w-4" />
        </Button>
      </Link>
    ),
  },
];

"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { formatManilaLongDate } from "@/lib/format-date";
import { Eye } from "lucide-react";
import type { CtoApplicationWithRelations } from "@/lib/actions/cto-actions";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  cancelled: "destructive",
};

export const ctoColumns: ColumnDef<CtoApplicationWithRelations>[] = [
  {
    id: "employee",
    accessorFn: (row) =>
      row.employees ? `${row.employees.last_name}, ${row.employees.first_name}` : "—",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
    cell: ({ row }) => {
      const emp = row.original.employees;
      if (!emp) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="space-y-0.5">
          <Link
            href={`/cto/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {emp.last_name}, {emp.first_name}
          </Link>
          {emp.departments && (
            <p className="text-xs text-muted-foreground">
              {emp.departments.code} — {emp.departments.name}
            </p>
          )}
        </div>
      );
    },
  },
  {
    id: "department",
    accessorFn: (row) => row.employees?.departments?.code ?? "",
    header: () => null,
    cell: () => null,
    filterFn: (row, _id, value: string[]) =>
      value.includes(row.original.employees?.departments?.code ?? ""),
  },
  {
    id: "created_by",
    accessorFn: (row) => row.created_by ?? "",
    header: () => null,
    cell: () => null,
    filterFn: (row, _id, value: string[]) =>
      value.includes(row.original.created_by ?? ""),
  },
  {
    id: "date_range",
    header: "Date Range",
    cell: ({ row }) => (
      <div>
        <p className="text-sm">
          {format(new Date(row.original.start_date), "MMM d")} –{" "}
          {format(new Date(row.original.end_date), "MMM d, yyyy")}
        </p>
        <p className="text-xs text-muted-foreground">
          Filed: {formatManilaLongDate(row.original.created_at)}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "hours_applied",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Hours" />,
    cell: ({ row }) => {
      const hours = Number(row.original.hours_applied);
      const days = hours / 8;
      return (
        <Badge variant="outline">
          {hours}h ({days} day{days === 1 ? "" : "s"})
        </Badge>
      );
    },
  },
  {
    id: "dept_approval",
    header: "Dept Head",
    cell: ({ row }) => {
      const app = row.original;
      if (app.status === "rejected" || app.status === "cancelled")
        return <span className="text-muted-foreground text-xs">—</span>;
      return app.dept_approved_at ? (
        <Badge variant="default" className="text-xs">Approved</Badge>
      ) : (
        <Badge variant="outline" className="text-xs">Pending</Badge>
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const s = row.getValue("status") as string;
      return <Badge variant={statusVariant[s] ?? "outline"}>{s.charAt(0).toUpperCase() + s.slice(1)}</Badge>;
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <Link href={`/cto/${row.original.id}`}>
        <Button variant="ghost" size="icon-sm">
          <Eye className="h-4 w-4" />
        </Button>
      </Link>
    ),
  },
];

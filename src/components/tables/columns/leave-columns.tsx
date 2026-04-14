"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { Eye } from "lucide-react";
import type { LeaveApplicationWithRelations } from "@/lib/actions/leave-actions";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  cancelled: "destructive",
};

export const leaveColumns: ColumnDef<LeaveApplicationWithRelations>[] = [
  {
    id: "employee",
    accessorFn: (row) =>
      row.employees ? `${row.employees.last_name}, ${row.employees.first_name}` : "—",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
    cell: ({ row }) => {
      const emp = row.original.employees;
      return emp ? (
        <div>
          <p className="font-medium">{emp.last_name}, {emp.first_name}</p>
          <p className="text-xs text-muted-foreground font-mono">{emp.employee_no ?? ""}</p>
        </div>
      ) : <span className="text-muted-foreground">—</span>;
    },
  },
  {
    id: "leave_type",
    accessorFn: (row) => row.leave_types?.name ?? "—",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Leave Type" />,
    cell: ({ row }) => {
      const lt = row.original.leave_types;
      return lt ? (
        <div>
          <p className="font-medium">{lt.name}</p>
          <p className="text-xs text-muted-foreground">{lt.code}</p>
        </div>
      ) : <span className="text-muted-foreground">—</span>;
    },
    filterFn: (row, id, value) => value.includes(row.original.leave_types?.code ?? ""),
  },
  {
    id: "date_range",
    header: "Date Range",
    cell: ({ row }) => (
      <span className="text-sm">
        {format(new Date(row.original.start_date), "MMM d")} –{" "}
        {format(new Date(row.original.end_date), "MMM d, yyyy")}
      </span>
    ),
  },
  {
    accessorKey: "days_applied",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Days" />,
    cell: ({ row }) => (
      <Badge variant="outline">{row.getValue("days_applied")} day(s)</Badge>
    ),
  },
  {
    id: "dept_approval",
    header: "Dept Head",
    cell: ({ row }) => {
      const app = row.original;
      if (app.status === "rejected" || app.status === "cancelled") return <span className="text-muted-foreground text-xs">—</span>;
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
      <Link href={`/leaves/${row.original.id}`}>
        <Button variant="ghost" size="icon-sm">
          <Eye className="h-4 w-4" />
        </Button>
      </Link>
    ),
  },
];

"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { Eye } from "lucide-react";
import type { NosiWithRelations } from "@/lib/actions/nosi-actions";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  cancelled: "destructive",
};

export const nosiColumns: ColumnDef<NosiWithRelations>[] = [
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
    id: "department",
    accessorFn: (row) => row.employees?.departments?.name ?? "—",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
    cell: ({ row }) => {
      const dept = row.original.employees?.departments;
      return dept ? (
        <span><span className="font-mono text-xs text-muted-foreground mr-1">{dept.code}</span>{dept.name}</span>
      ) : <span className="text-muted-foreground">—</span>;
    },
  },
  {
    id: "salary_change",
    header: "SG / Step",
    cell: ({ row }) => (
      <span className="text-sm">
        SG {row.original.current_salary_grade} — Step {row.original.current_step} → {row.original.new_step}
      </span>
    ),
  },
  {
    accessorKey: "effective_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Effective Date" />,
    cell: ({ row }) => format(new Date(row.getValue("effective_date")), "MMM d, yyyy"),
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
      <Link href={`/nosi/${row.original.id}`}>
        <Button variant="ghost" size="icon-sm">
          <Eye className="h-4 w-4" />
        </Button>
      </Link>
    ),
  },
];

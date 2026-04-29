"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { Eye } from "lucide-react";
import type { NosiWithRelations } from "@/lib/actions/nosi-actions";
import { NosiDeleteDraft } from "@/components/nosi/nosi-delete-draft";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  cancelled: "destructive",
};

export function getNosiColumns(options: {
  canDeleteDraft: boolean;
}): ColumnDef<NosiWithRelations>[] {
  const { canDeleteDraft } = options;
  return [
  {
    id: "employee",
    accessorFn: (row) =>
      row.employees ? `${row.employees.last_name}, ${row.employees.first_name}` : "—",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
    cell: ({ row }) => {
      const emp = row.original.employees;
      const href = `/employees/${row.original.employee_id}`;
      return emp ? (
        <Link href={href} className="font-medium text-primary hover:underline">
          {emp.last_name}, {emp.first_name}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
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
    cell: ({ row }) => {
      const isDraft = row.original.status === "draft";
      return (
        <div className="flex items-center justify-end gap-0.5">
          {canDeleteDraft && isDraft && (
            <NosiDeleteDraft nosiId={row.original.id} presentation="icon" />
          )}
          <Link href={`/nosi/${row.original.id}`}>
            <Button variant="ghost" size="icon-sm" aria-label="View NOSI">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      );
    },
  },
];
}

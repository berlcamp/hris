"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { format } from "date-fns";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import type { RspVacancyWithRelations } from "@/lib/actions/rsp-actions";
import {
  VACANCY_STATUS_LABELS,
  VACANCY_STATUS_VARIANT,
  isVacancyExpired,
  type RspVacancyStatus,
} from "@/lib/rsp-constants";

function formatDate(value: string | null): string {
  return value ? format(new Date(`${value}T00:00:00`), "MMM d, yyyy") : "—";
}

export const rspVacancyColumns: ColumnDef<RspVacancyWithRelations>[] = [
  {
    accessorKey: "item_number",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Item No." />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.item_number}</span>
    ),
  },
  {
    accessorKey: "position_title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Position" />
    ),
    cell: ({ row }) => (
      <Link
        href={`/rsp/${row.original.id}`}
        className="font-medium text-primary hover:underline"
      >
        {row.original.position_title}
      </Link>
    ),
  },
  {
    id: "organizational_unit",
    accessorFn: (row) => row.organizational_unit ?? "—",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Office" />
    ),
  },
  {
    accessorKey: "salary_grade",
    header: "SG",
    cell: ({ row }) =>
      row.original.salary_grade ? `SG ${row.original.salary_grade}` : "—",
  },
  {
    accessorKey: "publication_date",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Published" />
    ),
    cell: ({ row }) => formatDate(row.original.publication_date),
  },
  {
    accessorKey: "closing_date",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Closing" />
    ),
    cell: ({ row }) => formatDate(row.original.closing_date),
  },
  {
    accessorKey: "application_count",
    header: "Applicants",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.application_count}</span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const s = row.original.status as RspVacancyStatus;
      const expired = isVacancyExpired(row.original);
      return (
        <div className="flex items-center gap-1">
          <Badge variant={VACANCY_STATUS_VARIANT[s] ?? "outline"}>
            {VACANCY_STATUS_LABELS[s] ?? s}
          </Badge>
          {expired && <Badge variant="destructive">Expired</Badge>}
        </div>
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <div className="flex items-center justify-end">
        <Link href={`/rsp/${row.original.id}`}>
          <Button variant="ghost" size="icon-sm" aria-label="View vacancy">
            <Eye className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    ),
  },
];

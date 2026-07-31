"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { formatManilaLongDate, formatManilaShortDate } from "@/lib/format-date";
import type { CorrectionRequestListRow } from "@/lib/actions/attendance-correction-actions";

// "needs_rebase" is the one status a reader will not recognise from other
// modules, so it gets a label that says what to DO rather than what it is.
export const CORRECTION_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  needs_rebase: "Needs update",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Withdrawn",
};

const statusVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  needs_rebase: "destructive",
  approved: "default",
  rejected: "destructive",
  cancelled: "outline",
};

export const attendanceCorrectionColumns: ColumnDef<CorrectionRequestListRow>[] =
  [
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
        const dept = row.original.departments;
        return (
          <div className="space-y-0.5">
            <Link
              href={`/attendance-corrections/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {emp ? `${emp.last_name}, ${emp.first_name}` : "—"}
            </Link>
            {dept && (
              <p className="text-xs text-muted-foreground">
                {dept.code ? `${dept.code} — ${dept.name}` : dept.name}
              </p>
            )}
          </div>
        );
      },
    },
    {
      // Hidden filter-only column, same pattern as leave-columns' department.
      id: "department",
      accessorFn: (row) => row.departments?.code ?? "",
      header: () => null,
      cell: () => null,
      filterFn: (row, _id, value: string[]) =>
        value.includes(row.original.departments?.code ?? ""),
    },
    {
      id: "period",
      accessorFn: (row) => row.date_from,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Period" />
      ),
      cell: ({ row }) => {
        const { date_from, date_to } = row.original;
        return (
          <span className="text-sm">
            {date_from === date_to
              ? formatManilaShortDate(date_from)
              : `${formatManilaShortDate(date_from)} – ${formatManilaShortDate(date_to)}`}
          </span>
        );
      },
    },
    {
      id: "reason",
      accessorFn: (row) => row.reason,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Reason" />
      ),
      cell: ({ row }) => (
        <span
          className="block max-w-[28ch] truncate text-sm text-muted-foreground"
          title={row.original.reason}
        >
          {row.original.reason}
        </span>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => row.status,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={statusVariant[row.original.status] ?? "outline"}>
            {CORRECTION_STATUS_LABELS[row.original.status] ??
              row.original.status}
          </Badge>
          {/* Distinguishes "HR recorded this themselves" from "a department
              asked and HR agreed" — both end up approved, but only one had a
              second pair of eyes on it. */}
          {row.original.direct_apply && (
            <Badge variant="outline" className="font-normal">
              Direct
            </Badge>
          )}
        </div>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      id: "requested",
      accessorFn: (row) => row.requested_at,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Filed" />
      ),
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <p className="text-sm">
            {formatManilaLongDate(row.original.requested_at)}
          </p>
          {row.original.requested_by_email && (
            <p className="text-xs text-muted-foreground">
              {row.original.requested_by_email}
            </p>
          )}
        </div>
      ),
    },
  ];

"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { ApplicantFormDialog } from "@/components/rsp/applicant-form-dialog";
import { RspApplicantDelete } from "@/components/rsp/applicant-delete";
import type { RspApplicantWithCount } from "@/lib/actions/rsp-actions";
import { formatApplicantName } from "@/lib/rsp-constants";

export const rspApplicantColumns: ColumnDef<RspApplicantWithCount>[] = [
  {
    id: "name",
    accessorFn: (row) => formatApplicantName(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">{formatApplicantName(row.original)}</span>
    ),
  },
  {
    accessorKey: "sex",
    header: "Sex",
    cell: ({ row }) =>
      row.original.sex
        ? row.original.sex.charAt(0).toUpperCase() + row.original.sex.slice(1)
        : "—",
  },
  {
    accessorKey: "birth_date",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Birth Date" />
    ),
    cell: ({ row }) =>
      row.original.birth_date
        ? format(new Date(`${row.original.birth_date}T00:00:00`), "MMM d, yyyy")
        : "—",
  },
  {
    id: "contact",
    header: "Contact",
    cell: ({ row }) => (
      <div className="text-sm">
        <p>{row.original.email ?? "—"}</p>
        <p className="text-muted-foreground">{row.original.mobile_no ?? ""}</p>
      </div>
    ),
  },
  {
    accessorKey: "application_count",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Applications" />
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.application_count}</span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-0.5">
        <ApplicantFormDialog
          applicant={row.original}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Edit applicant">
              <Pencil className="h-4 w-4" />
            </Button>
          }
        />
        {row.original.application_count === 0 && (
          <RspApplicantDelete
            applicantId={row.original.id}
            applicantName={formatApplicantName(row.original)}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete applicant"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            }
          />
        )}
      </div>
    ),
  },
];

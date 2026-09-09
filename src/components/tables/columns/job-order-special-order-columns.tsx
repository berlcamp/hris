"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Copy, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { JobOrderSpecialOrder } from "@/lib/types";

function fmtDate(d: string | null): string {
  return d ? format(new Date(`${d}T00:00:00`), "MMM d, yyyy") : "—";
}

export function jobOrderSpecialOrderColumns(handlers: {
  onView: (so: JobOrderSpecialOrder) => void;
  onEdit: (so: JobOrderSpecialOrder) => void;
  onDuplicate: (so: JobOrderSpecialOrder) => void;
  onDelete: (so: JobOrderSpecialOrder) => void;
  canEdit: boolean;
}): ColumnDef<JobOrderSpecialOrder>[] {
  return [
    {
      // A plain header, not DataTableColumnHeader: this list is
      // server-paginated, so sorting the rows currently in the browser would
      // reorder a page rather than the result set.
      id: "so_no",
      header: "SO No.",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => handlers.onView(row.original)}
          className="font-medium whitespace-nowrap underline-offset-4 hover:underline"
        >
          {row.original.so_no ?? "—"}
        </button>
      ),
    },
    {
      id: "subject",
      header: "Subject",
      cell: ({ row }) => (
        <span className="block max-w-[26rem] truncate">
          {row.original.subject}
        </span>
      ),
    },
    {
      id: "period_covered",
      header: "Effective",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.period_covered ?? "—"}
        </span>
      ),
    },
    {
      id: "so_date",
      header: "Date",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{fmtDate(row.original.so_date)}</span>
      ),
    },
    {
      id: "member_count",
      header: "Personnel",
      cell: ({ row }) => row.original.member_count,
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" className="h-8 w-8 p-0" />}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handlers.onView(row.original)}>
              <Eye className="mr-2 h-4 w-4" /> Open
            </DropdownMenuItem>
            {handlers.canEdit && (
              <DropdownMenuItem onClick={() => handlers.onEdit(row.original)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit details
              </DropdownMenuItem>
            )}
            {handlers.canEdit && (
              <DropdownMenuItem
                onClick={() => handlers.onDuplicate(row.original)}
              >
                <Copy className="mr-2 h-4 w-4" /> Duplicate
              </DropdownMenuItem>
            )}
            {handlers.canEdit && (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => handlers.onDelete(row.original)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}

"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { formatJoAddress } from "@/lib/job-order-helpers";
import type { JobOrderEmployee } from "@/lib/types";

function fmtDate(d: string | null): string {
  return d ? format(new Date(`${d}T00:00:00`), "MMM d, yyyy") : "—";
}

function fmtRate(n: number | null): string {
  return n == null
    ? "—"
    : n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export function jobOrderColumns(handlers: {
  onView: (employee: JobOrderEmployee) => void;
  onEdit: (employee: JobOrderEmployee) => void;
  onDelete: (employee: JobOrderEmployee) => void;
}): ColumnDef<JobOrderEmployee>[] {
  return [
    {
      id: "full_name",
      accessorKey: "full_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      // The address rides under the name rather than in a column of its own:
      // nine columns of free text put this table permanently into a horizontal
      // scroll, and an address is only ever read next to the person it belongs
      // to. Everything merged away here is still its own column in the Excel
      // export and its own field in the details dialog.
      cell: ({ row }) => {
        const address = formatJoAddress(row.original.purok, row.original.barangay);
        return (
          <div className="max-w-[16rem]">
            {/* A button, not a link: Job Order personnel have no page of their
                own, so the record opens in a dialog over the list. */}
            <button
              type="button"
              onClick={() => handlers.onView(row.original)}
              className="text-primary block max-w-full truncate text-left font-medium hover:underline"
              title={row.original.full_name}
            >
              {row.getValue("full_name")}
            </button>
            {address && (
              <span
                className="text-muted-foreground block max-w-full truncate text-xs"
                title={address}
              >
                {address}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "area",
      // Sort by the displayed name, not the underlying UUID (matches the
      // "department" column convention in employee-columns.tsx). Filtering
      // reads the raw id off row.original since area-filter options are ids.
      accessorFn: (row) => row.area_name ?? "—",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Area" />
      ),
      // Sub-area sits under its area instead of holding a second column of
      // free text. Both truncate; the full value is on hover.
      cell: ({ row }) => (
        <div className="max-w-[12rem]">
          {row.original.area_name ? (
            <span
              className="block max-w-full truncate"
              title={row.original.area_name}
            >
              {row.original.area_name}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {row.original.sub_area && (
            <span
              className="text-muted-foreground block max-w-full truncate text-xs"
              title={row.original.sub_area}
            >
              {row.original.sub_area}
            </span>
          )}
        </div>
      ),
      filterFn: (row, id, value) => {
        return value.includes(row.original.area_id);
      },
    },
    {
      accessorKey: "daily_rate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Daily Rate" />
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono text-xs">
          {fmtRate(row.getValue("daily_rate"))}
        </div>
      ),
    },
    {
      accessorKey: "date_started",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Started" />
      ),
      // Who recommended the hire is read together with when it started, so the
      // two share a cell.
      cell: ({ row }) => (
        <div className="max-w-[12rem]">
          <span className="block whitespace-nowrap">
            {fmtDate(row.getValue("date_started"))}
          </span>
          {row.original.recommended_by && (
            <span
              className="text-muted-foreground block max-w-full truncate text-xs"
              title={row.original.recommended_by}
            >
              rec. {row.original.recommended_by}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      // Carries the ATM badge too: both are one-word facts about the record,
      // and neither earns a column to itself.
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          {row.getValue("status") === "active" ? (
            <Badge
              variant="outline"
              className="border-transparent bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
            >
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Inactive
            </Badge>
          )}
          {row.original.has_atm ? (
            <Badge variant="outline">ATM</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              No ATM
            </Badge>
          )}
        </div>
      ),
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      // Hidden (see initialColumnVisibility where this table is mounted): the
      // ATM badge lives in the status cell now, but the toolbar's ATM filter
      // still needs a column with this id to filter and facet on.
      id: "has_atm",
      accessorFn: (row) => (row.has_atm ? "yes" : "no"),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="ATM" />
      ),
      cell: ({ row }) => (row.original.has_atm ? "Yes" : "No"),
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handlers.onView(row.original)}>
              <Eye className="h-4 w-4" />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handlers.onEdit(row.original)}>
              <Pencil className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => handlers.onDelete(row.original)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}

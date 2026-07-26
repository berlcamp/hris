"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

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
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("full_name")}</span>
      ),
    },
    {
      id: "area",
      accessorFn: (row) => row.area_id,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Area" />
      ),
      cell: ({ row }) =>
        row.original.area_name ?? (
          <span className="text-muted-foreground">—</span>
        ),
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: "sub_area",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Sub-Area" />
      ),
      cell: ({ row }) => {
        const subArea = row.getValue("sub_area") as string | null;
        return subArea ?? <span className="text-muted-foreground">—</span>;
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
      id: "address",
      accessorFn: (row) => formatJoAddress(row.purok, row.barangay),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Address" />
      ),
      cell: ({ row }) => {
        const address = row.getValue("address") as string;
        return address ? (
          <span
            className="block max-w-[16rem] truncate text-sm"
            title={address}
          >
            {address}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      accessorKey: "date_started",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date Started" />
      ),
      cell: ({ row }) => fmtDate(row.getValue("date_started")),
    },
    {
      id: "has_atm",
      accessorFn: (row) => (row.has_atm ? "yes" : "no"),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="ATM" />
      ),
      cell: ({ row }) =>
        row.original.has_atm ? (
          <Badge variant="outline">Yes</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            No
          </Badge>
        ),
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) =>
        row.getValue("status") === "active" ? (
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
        ),
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

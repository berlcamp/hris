"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Copy, MoreHorizontal, Eye, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { JobOrderPayroll } from "@/lib/types";

function fmtDate(d: string | null): string {
  return d ? format(new Date(`${d}T00:00:00`), "MMM d, yyyy") : "—";
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export function jobOrderPayrollColumns(handlers: {
  onView: (p: JobOrderPayroll) => void;
  onDuplicate: (p: JobOrderPayroll) => void;
  onDelete: (p: JobOrderPayroll) => void;
  canDelete: boolean;
  /** Duplicating CREATES a payroll, so it follows payroll write access. */
  canDuplicate: boolean;
}): ColumnDef<JobOrderPayroll>[] {
  return [
    {
      // A plain header, not DataTableColumnHeader: this column has no
      // accessorKey, so getCanSort() is false and the sort control that
      // component renders did nothing. The list is server-paginated anyway —
      // see the note on useReactTable in job-order-payroll-list-client.
      id: "period",
      header: "Period",
      cell: ({ row }) => (
        <span className="font-medium whitespace-nowrap">
          {fmtDate(row.original.period_start)} – {fmtDate(row.original.period_end)}
        </span>
      ),
    },
    {
      id: "description",
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => row.original.description ?? "—",
    },
    {
      id: "areas",
      header: "Areas",
      cell: ({ row }) => (
        <span className="block max-w-[22rem] truncate text-muted-foreground">
          {row.original.areas ?? "—"}
        </span>
      ),
    },
    {
      id: "days",
      header: "Days",
      cell: ({ row }) => row.original.days ?? "—",
    },
    {
      id: "member_count",
      header: "Members",
      cell: ({ row }) => row.original.member_count,
    },
    {
      id: "total_net",
      header: "Net total",
      cell: ({ row }) => (
        <span className="tabular-nums">{fmtMoney(row.original.total_net)}</span>
      ),
    },
    {
      id: "reconstructed",
      header: "",
      cell: ({ row }) =>
        row.original.is_reconstructed ? (
          <Badge
            variant="outline"
            title="Imported from the legacy system and priced at the employee's rate at import time — a reconstruction, not the original record."
          >
            Reconstructed
          </Badge>
        ) : null,
    },
    {
      id: "payroll_date",
      header: "Payroll date",
      cell: ({ row }) => fmtDate(row.original.payroll_date),
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
            {handlers.canDuplicate && (
              <DropdownMenuItem
                onClick={() => handlers.onDuplicate(row.original)}
              >
                <Copy className="mr-2 h-4 w-4" /> Duplicate
              </DropdownMenuItem>
            )}
            {handlers.canDelete && (
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

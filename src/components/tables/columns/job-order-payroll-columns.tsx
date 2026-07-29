"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { MoreHorizontal, Eye, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import type { JobOrderPayroll } from "@/lib/types";

function fmtDate(d: string | null): string {
  return d ? format(new Date(`${d}T00:00:00`), "MMM d, yyyy") : "—";
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export function jobOrderPayrollColumns(handlers: {
  onView: (p: JobOrderPayroll) => void;
  onDelete: (p: JobOrderPayroll) => void;
  canDelete: boolean;
}): ColumnDef<JobOrderPayroll>[] {
  return [
    {
      id: "period",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Period" />
      ),
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
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Badge
            variant={row.original.status === "finalized" ? "default" : "secondary"}
          >
            {row.original.status === "finalized" ? "Finalized" : "Draft"}
          </Badge>
          {row.original.is_reconstructed && (
            <Badge
              variant="outline"
              title="Imported from the legacy system and priced at the employee's rate at import time — a reconstruction, not the original record."
            >
              Reconstructed
            </Badge>
          )}
        </div>
      ),
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
            {/* Duplicate is intentionally absent: it needs a metadata dialog
                to collect the new period before it can clone anything, which
                Task 8 builds alongside the detail page. Task 8 adds this
                action back, wired to duplicateJobOrderPayroll. */}
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

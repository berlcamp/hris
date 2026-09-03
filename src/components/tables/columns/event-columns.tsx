"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Eye, ScanLine, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EventListRow, EventStatus } from "@/lib/types";

function fmtDate(d: string): string {
  return format(new Date(`${d}T00:00:00`), "MMM d, yyyy");
}

const STATUS_VARIANT: Record<EventStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  open: "default",
  closed: "secondary",
};

export function eventColumns(opts: {
  canManage: boolean;
}): ColumnDef<EventListRow>[] {
  return [
    {
      // Plain headers, not DataTableColumnHeader: this list is
      // server-paginated, so sorting the rows in the browser would reorder a
      // page rather than the result set.
      id: "title",
      header: "Event",
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="block truncate font-medium">{row.original.title}</span>
          {row.original.venue ? (
            <span className="text-muted-foreground block truncate text-xs">
              {row.original.venue}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: "dates",
      header: "Dates",
      cell: ({ row }) => {
        const { start_date, end_date } = row.original;
        return (
          <span className="whitespace-nowrap">
            {start_date === end_date
              ? fmtDate(start_date)
              : `${fmtDate(start_date)} – ${fmtDate(end_date)}`}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={STATUS_VARIANT[row.original.status]}>
            {row.original.status}
          </Badge>
          {/* The flag changes what happens at the door, so it belongs where
              somebody scanning the list will see it. */}
          {row.original.exclusive_participation && (
            <Badge variant="outline" className="gap-1">
              <ShieldAlert className="h-3 w-3" />
              One event only
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "roster",
      header: "Expected",
      cell: ({ row }) => <span>{row.original.roster_count}</span>,
    },
    {
      id: "attendance",
      header: "Recorded",
      cell: ({ row }) => <span>{row.original.attendance_count}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          {row.original.status === "open" ? (
            <Link href={`/scan/${row.original.id}`}>
              <Button variant="outline" size="sm">
                <ScanLine className="h-4 w-4" />
                Scan
              </Button>
            </Link>
          ) : null}
          {opts.canManage ? (
            <Link href={`/events/${row.original.id}`}>
              <Button variant="ghost" size="sm">
                <Eye className="h-4 w-4" />
                Open
              </Button>
            </Link>
          ) : null}
        </div>
      ),
    },
  ];
}

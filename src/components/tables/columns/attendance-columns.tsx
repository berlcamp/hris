"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { Trash2 } from "lucide-react";
import type { AttendanceLogRow } from "@/lib/actions/attendance-actions";

function TimeBadge({ time, type }: { time: string | null; type: "in" | "out" }) {
  if (!time) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className={`text-xs font-mono ${type === "in" ? "text-green-600" : "text-blue-600"}`}>
      {time}
    </span>
  );
}

export function createAttendanceColumns(
  onDelete?: (id: string) => void
): ColumnDef<AttendanceLogRow>[] {
  return [
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
        return emp ? (
          <div>
            <p className="font-medium">
              {emp.last_name}, {emp.first_name}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              {emp.employee_no}
            </p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      accessorKey: "date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => {
        const date = new Date(row.original.date + "T00:00:00");
        return (
          <div>
            <p className="text-sm font-medium">
              {format(date, "MMM d, yyyy")}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(date, "EEEE")}
            </p>
          </div>
        );
      },
    },
    {
      id: "am",
      header: "AM (In / Out)",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <TimeBadge time={row.original.time_in_am} type="in" />
          <span className="text-muted-foreground text-xs">/</span>
          <TimeBadge time={row.original.time_out_am} type="out" />
        </div>
      ),
    },
    {
      id: "pm",
      header: "PM (In / Out)",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <TimeBadge time={row.original.time_in_pm} type="in" />
          <span className="text-muted-foreground text-xs">/</span>
          <TimeBadge time={row.original.time_out_pm} type="out" />
        </div>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => {
        if (row.is_absent) return "absent";
        const parts: string[] = [];
        if (row.is_late) parts.push("late");
        if (row.is_undertime) parts.push("undertime");
        return parts.length > 0 ? parts.join(",") : "on_time";
      },
      header: "Status",
      cell: ({ row }) => {
        const { is_absent, is_late, is_undertime, late_minutes, undertime_minutes } =
          row.original;
        if (is_absent) {
          return <Badge variant="destructive">Absent</Badge>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {is_late && (
              <Badge variant="secondary" className="text-xs">
                Late {late_minutes}m
              </Badge>
            )}
            {is_undertime && (
              <Badge variant="secondary" className="text-xs">
                UT {undertime_minutes}m
              </Badge>
            )}
            {!is_late && !is_undertime && (
              <Badge variant="default" className="text-xs">
                On Time
              </Badge>
            )}
          </div>
        );
      },
      filterFn: (row, id, value: string[]) => {
        if (!value || value.length === 0) return true;
        const status = row.getValue<string>(id);
        return value.some((v) => status.includes(v));
      },
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs capitalize">
          {row.original.source}
        </Badge>
      ),
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: "remarks",
      header: "Remarks",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.remarks ?? "—"}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) =>
        onDelete ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(row.original.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null,
    },
  ];
}

"use client";

import { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { LeaveCreditAdjustmentDialog } from "@/components/leaves/leave-credit-adjustment-dialog";
import type { LeaveTypeRow } from "@/lib/actions/leave-actions";

export type LeaveCreditTableRow = {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  department: string;
  vl: { balance: number; total: number } | null;
  sl: { balance: number; total: number } | null;
  otherBalance: number;
  needsManualEntry: boolean;
};

export function getLeaveCreditColumns({
  leaveTypes,
  isAdmin,
  year,
}: {
  leaveTypes: LeaveTypeRow[];
  isAdmin: boolean;
  year: number;
}): ColumnDef<LeaveCreditTableRow>[] {
  const columns: ColumnDef<LeaveCreditTableRow>[] = [
    {
      id: "employee",
      accessorFn: (row) => row.employeeName,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Employee" />
      ),
      cell: ({ row }) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{row.original.employeeName}</p>
            {row.original.needsManualEntry && (
              <Badge
                variant="outline"
                className="border-amber-500 text-amber-700 dark:text-amber-400 gap-1"
              >
                <AlertTriangle className="h-3 w-3" />
                Needs entry
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {row.original.employeeNo}
          </p>
        </div>
      ),
      filterFn: (row, _id, value) => {
        const v = String(value).toLowerCase();
        const r = row.original;
        return (
          r.employeeName.toLowerCase().includes(v) ||
          r.employeeNo.toLowerCase().includes(v) ||
          r.department.toLowerCase().includes(v)
        );
      },
    },
    {
      accessorKey: "department",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Department" />
      ),
      cell: ({ row }) => row.original.department,
    },
    {
      id: "vl",
      accessorFn: (row) => row.vl?.balance ?? null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="VL" />
      ),
      cell: ({ row }) => {
        const c = row.original.vl;
        return c ? (
          <div className="text-center">
            <span className="font-semibold">{c.balance}</span>
            <span className="text-xs text-muted-foreground">/{c.total}</span>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">—</div>
        );
      },
      sortingFn: (a, b) =>
        (a.original.vl?.balance ?? -Infinity) -
        (b.original.vl?.balance ?? -Infinity),
    },
    {
      id: "sl",
      accessorFn: (row) => row.sl?.balance ?? null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="SL" />
      ),
      cell: ({ row }) => {
        const c = row.original.sl;
        return c ? (
          <div className="text-center">
            <span className="font-semibold">{c.balance}</span>
            <span className="text-xs text-muted-foreground">/{c.total}</span>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">—</div>
        );
      },
      sortingFn: (a, b) =>
        (a.original.sl?.balance ?? -Infinity) -
        (b.original.sl?.balance ?? -Infinity),
    },
    {
      id: "other",
      accessorKey: "otherBalance",
      header: () => <div className="text-center">Other</div>,
      cell: ({ row }) => {
        const v = row.original.otherBalance;
        return (
          <div className="text-center">
            {v > 0 ? (
              <Badge variant="outline">{v}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        );
      },
    },
  ];

  if (isAdmin) {
    columns.push({
      id: "actions",
      cell: ({ row }) => (
        <LeaveCreditAdjustmentDialog
          employeeId={row.original.employeeId}
          employeeName={row.original.employeeName}
          leaveTypes={leaveTypes}
          year={year}
        />
      ),
    });
  }

  return columns;
}

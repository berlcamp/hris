"use client";

import { useMemo } from "react";

import { DataTable } from "@/components/tables/data-table";
import {
  getLeaveCreditColumns,
  type LeaveCreditTableRow,
} from "@/components/tables/columns/leave-credit-columns";
import type { LeaveTypeRow } from "@/lib/actions/leave-actions";

interface LeaveCreditsTableProps {
  rows: LeaveCreditTableRow[];
  leaveTypes: LeaveTypeRow[];
  isAdmin: boolean;
  year: number;
}

export function LeaveCreditsTable({
  rows,
  leaveTypes,
  isAdmin,
  year,
}: LeaveCreditsTableProps) {
  const columns = useMemo(
    () => getLeaveCreditColumns({ leaveTypes, isAdmin, year }),
    [leaveTypes, isAdmin, year]
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchableColumns={[{ id: "employee", title: "name, ID, or department" }]}
    />
  );
}

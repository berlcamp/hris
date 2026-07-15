"use client";

import { DataTable } from "@/components/tables/data-table";
import { createAttendanceColumns } from "@/components/tables/columns/attendance-columns";
import type { AttendanceLogRow } from "@/lib/actions/attendance-actions";

interface AttendanceTableClientProps {
  data: AttendanceLogRow[];
  /** Shows the row actions (correct entry, remarks, logs). */
  canManage?: boolean;
  /** Adds Delete to those actions — a narrower grant than canManage. */
  canDelete?: boolean;
}

export function AttendanceTableClient({
  data,
  canManage = false,
  canDelete = false,
}: AttendanceTableClientProps) {
  const columns = createAttendanceColumns(canManage, canDelete);

  return (
    <DataTable
      columns={columns}
      data={data}
      filterableColumns={[
        {
          id: "status",
          title: "Status",
          options: [
            { label: "On Time", value: "on_time" },
            { label: "Late", value: "late" },
            { label: "Undertime", value: "undertime" },
            { label: "Absent", value: "absent" },
          ],
        },
        {
          id: "source",
          title: "Source",
          options: [
            { label: "Manual", value: "manual" },
            { label: "Biometric", value: "biometric" },
          ],
        },
      ]}
      searchableColumns={[{ id: "employee", title: "employee" }]}
    />
  );
}

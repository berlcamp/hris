"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DataTable } from "@/components/tables/data-table";
import { createAttendanceColumns } from "@/components/tables/columns/attendance-columns";
import { deleteAttendanceEntry } from "@/lib/actions/attendance-actions";
import type { AttendanceLogRow } from "@/lib/actions/attendance-actions";

interface AttendanceTableClientProps {
  data: AttendanceLogRow[];
  isAdmin: boolean;
}

export function AttendanceTableClient({ data, isAdmin }: AttendanceTableClientProps) {
  const router = useRouter();

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this attendance record?")) return;
    try {
      await deleteAttendanceEntry(id);
      toast.success("Record deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete record");
    }
  };

  const columns = createAttendanceColumns(isAdmin ? handleDelete : undefined);

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

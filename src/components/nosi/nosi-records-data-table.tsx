"use client";

import { DataTable } from "@/components/tables/data-table";
import { getNosiColumns } from "@/components/tables/columns/nosi-columns";
import type { NosiWithRelations } from "@/lib/actions/nosi-actions";

export function NosiRecordsDataTable({
  data,
  canDeleteDraft,
}: {
  data: NosiWithRelations[];
  canDeleteDraft: boolean;
}) {
  return (
    <DataTable
      columns={getNosiColumns({ canDeleteDraft })}
      data={data}
      filterableColumns={[
        {
          id: "status",
          title: "Status",
          options: [
            { label: "Draft", value: "draft" },
            { label: "Pending", value: "pending" },
            { label: "Approved", value: "approved" },
            { label: "Rejected", value: "rejected" },
          ],
        },
      ]}
      searchableColumns={[{ id: "employee", title: "employee" }]}
    />
  );
}

"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { cosEmployeeColumns } from "@/components/tables/columns/cos-employee-columns";
import type { CosEmployeeWithDepartment } from "@/lib/actions/cos-employee-actions";
import {
  COS_EMPLOYEE_STATUSES,
  COS_EMPLOYEE_STATUS_LABELS,
} from "@/lib/cos-constants";

interface CosEmployeeListClientProps {
  employees: CosEmployeeWithDepartment[];
  /** Department names, matching the "department" column's accessor value. */
  departmentOptions: { label: string; value: string }[];
  canCreate: boolean;
}

export function CosEmployeeListClient({
  employees,
  departmentOptions,
  canCreate,
}: CosEmployeeListClientProps) {
  return (
    <DataTable
      columns={cosEmployeeColumns}
      data={employees}
      searchableColumns={[{ id: "name", title: "name or COS no." }]}
      filterableColumns={[
        { id: "department", title: "Department", options: departmentOptions },
        {
          id: "status",
          title: "Status",
          options: COS_EMPLOYEE_STATUSES.map((s) => ({
            label: COS_EMPLOYEE_STATUS_LABELS[s],
            value: s,
          })),
        },
      ]}
      toolbar={
        canCreate ? (
          <Link href="/cos/employees/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add COS Employee
            </Button>
          </Link>
        ) : null
      }
    />
  );
}

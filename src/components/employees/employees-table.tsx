"use client";

import { useMemo } from "react";
import { DataTable } from "@/components/tables/data-table";
import {
  getEmployeeColumns,
  type EmployeeRow,
} from "@/components/tables/columns/employee-columns";
import { ExportCsvButton } from "@/components/tables/export-csv-button";
import { EMPLOYEE_STATUS_LABELS } from "@/lib/constants";

interface EmployeesTableProps {
  data: EmployeeRow[];
  departmentOptions: { label: string; value: string }[];
  canEdit: boolean;
}

export function EmployeesTable({
  data,
  departmentOptions,
  canEdit,
}: EmployeesTableProps) {
  const columns = useMemo(() => getEmployeeColumns({ canEdit }), [canEdit]);
  return (
    <DataTable
      columns={columns}
      data={data}
      searchableColumns={[{ id: "full_name", title: "name" }]}
      filterableColumns={[
        {
          id: "department",
          title: "Department",
          options: departmentOptions,
        },
        {
          id: "employment_type",
          title: "Type",
          options: [
            { label: "Plantilla", value: "plantilla" },
            { label: "Job Order", value: "jo" },
            { label: "Contract of Service", value: "cos" },
          ],
        },
        {
          id: "status",
          title: "Status",
          options: [
            "active",
            "inactive",
            "retired",
            "resigned",
            "terminated",
            "suspended",
            "awol",
            "dropped",
            "deceased",
          ].map((value) => ({
            label: EMPLOYEE_STATUS_LABELS[value] ?? value,
            value,
          })),
        },
        {
          id: "vl_sl_status",
          title: "VL/SL",
          options: [
            { label: "Needs manual entry", value: "missing" },
            { label: "OK", value: "ok" },
          ],
        },
      ]}
      toolbar={(table) => (
        <ExportCsvButton
          key="export-csv"
          data={table.getFilteredRowModel().rows.map((r) => r.original)}
          filename="employees"
          columns={[
            { key: "last_name", header: "Last Name" },
            { key: "first_name", header: "First Name" },
            { key: "middle_name", header: "Middle Name" },
            { key: "employment_type", header: "Employment Type" },
            { key: "status", header: "Status" },
          ]}
        />
      )}
    />
  );
}

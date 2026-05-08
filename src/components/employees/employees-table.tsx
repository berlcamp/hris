"use client";

import { DataTable } from "@/components/tables/data-table";
import { employeeColumns, type EmployeeRow } from "@/components/tables/columns/employee-columns";
import { ExportCsvButton } from "@/components/tables/export-csv-button";

interface EmployeesTableProps {
  data: EmployeeRow[];
  departmentOptions: { label: string; value: string }[];
}

export function EmployeesTable({ data, departmentOptions }: EmployeesTableProps) {
  return (
    <DataTable
      columns={employeeColumns}
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
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" },
            { label: "Retired", value: "retired" },
            { label: "Terminated", value: "terminated" },
            { label: "Resigned", value: "resigned" },
          ],
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

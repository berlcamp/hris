"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { ExportExcelButton } from "@/components/tables/export-excel-button";
import { cosEmployeeColumns } from "@/components/tables/columns/cos-employee-columns";
import type { CosEmployeeWithDepartment } from "@/lib/actions/cos-employee-actions";
import type { XlsxColumn } from "@/lib/xlsx";
import {
  COS_EMPLOYEE_STATUSES,
  COS_EMPLOYEE_STATUS_LABELS,
  COS_SEX_LABELS,
  formatCosEmployeeName,
} from "@/lib/cos-constants";

/**
 * The export carries more than the on-screen table: the sheet is what HR hands
 * to accounting, so contact and eligibility fields ride along even though the
 * table hides them.
 */
const EXPORT_COLUMNS: XlsxColumn<CosEmployeeWithDepartment>[] = [
  { header: "COS No.", value: (e) => e.cos_no },
  { header: "Name", value: (e) => formatCosEmployeeName(e) },
  { header: "Last Name", value: (e) => e.last_name },
  { header: "First Name", value: (e) => e.first_name },
  { header: "Middle Name", value: (e) => e.middle_name },
  { header: "Suffix", value: (e) => e.suffix },
  { header: "Sex", value: (e) => (e.sex ? COS_SEX_LABELS[e.sex] : "") },
  { header: "Birth Date", value: (e) => e.birth_date },
  { header: "Address", value: (e) => e.address },
  { header: "Contact No.", value: (e) => e.contact_number },
  { header: "Email", value: (e) => e.email },
  { header: "Office / Department", value: (e) => e.departments?.name },
  { header: "Position", value: (e) => e.position_title },
  // A number, not a formatted string, so Excel can sum the column.
  { header: "Monthly Rate", value: (e) => e.monthly_rate },
  { header: "Eligibility", value: (e) => e.eligibility },
  { header: "Recommended By", value: (e) => e.recommended_by },
  { header: "Status", value: (e) => COS_EMPLOYEE_STATUS_LABELS[e.status] },
  { header: "Remarks", value: (e) => e.remarks },
];

/** Only super admins export the raw record id. */
const ID_COLUMN: XlsxColumn<CosEmployeeWithDepartment> = {
  header: "ID",
  value: (e) => e.id,
};

interface CosEmployeeListClientProps {
  employees: CosEmployeeWithDepartment[];
  /** Department names, matching the "department" column's accessor value. */
  departmentOptions: { label: string; value: string }[];
  canCreate: boolean;
  canDelete: boolean;
  /** Super admins get the raw record `id` in the sheet; nobody else needs it. */
  isSuperAdmin?: boolean;
}

export function CosEmployeeListClient({
  employees,
  departmentOptions,
  canCreate,
  canDelete,
  isSuperAdmin = false,
}: CosEmployeeListClientProps) {
  const exportColumns = isSuperAdmin
    ? [ID_COLUMN, ...EXPORT_COLUMNS]
    : EXPORT_COLUMNS;

  return (
    <DataTable
      columns={cosEmployeeColumns({ canDelete })}
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
      toolbar={(table) => (
        <>
          <ExportExcelButton
            rows={table.getFilteredRowModel().rows.map((r) => r.original)}
            columns={exportColumns}
            filename="cos-employees"
            sheetName="COS Employees"
          />
          {canCreate ? (
            <Link href="/cos/employees/new">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Add COS Employee
              </Button>
            </Link>
          ) : null}
        </>
      )}
    />
  );
}

"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { ExportExcelButton } from "@/components/tables/export-excel-button";
import type { XlsxColumn } from "@/lib/xlsx";
import {
  formatSalaryGradeRange,
  positionFileSlug,
  type PositionItem,
  type PositionSummaryRow,
} from "@/lib/position-summary";

function incumbentName(item: PositionItem): string {
  const e = item.employees;
  if (!e) return "";
  const given = [e.first_name, e.middle_name, e.suffix].filter(Boolean).join(" ");
  return `${e.last_name}, ${given}`;
}

/** One row per incumbent; shared by the per-position and all-positions downloads. */
export const INCUMBENT_EXPORT_COLUMNS: XlsxColumn<PositionItem>[] = [
  { header: "Position", value: (i) => i.position_title },
  { header: "Item No.", value: (i) => i.item_number },
  { header: "Employee ID", value: (i) => i.employees?.id_number },
  { header: "Name", value: incumbentName },
  { header: "Last Name", value: (i) => i.employees?.last_name },
  { header: "First Name", value: (i) => i.employees?.first_name },
  { header: "Middle Name", value: (i) => i.employees?.middle_name },
  { header: "Suffix", value: (i) => i.employees?.suffix },
  { header: "Salary Grade", value: (i) => i.salary_grade },
  { header: "Step", value: (i) => i.step },
  { header: "Department", value: (i) => i.employees?.departments?.name },
  { header: "Organizational Unit", value: (i) => i.organizational_unit },
  { header: "Appointment Status", value: (i) => i.status },
  { header: "Date of Original Appointment", value: (i) => i.date_of_original_appointment },
  // A number, not a formatted string, so Excel can sum the column.
  { header: "Actual Annual Salary", value: (i) => i.actual_annual_salary },
  { header: "Employee Status", value: (i) => i.employees?.status },
];

function countCell(value: number, muted = false) {
  return (
    <span className={muted && value === 0 ? "text-muted-foreground tabular-nums" : "tabular-nums"}>
      {value}
    </span>
  );
}

export const positionSummaryColumns: ColumnDef<PositionSummaryRow>[] = [
  {
    accessorKey: "title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Position" />,
    cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
  },
  {
    id: "salary_grade",
    accessorFn: (row) => row.maxSalaryGrade ?? -1,
    header: ({ column }) => <DataTableColumnHeader column={column} title="SG" />,
    cell: ({ row }) => (
      <span className="tabular-nums">{formatSalaryGradeRange(row.original) || "—"}</span>
    ),
  },
  {
    accessorKey: "total",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
    cell: ({ row }) => countCell(row.original.total),
  },
  {
    accessorKey: "filled",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Filled" />,
    cell: ({ row }) => countCell(row.original.filled, true),
  },
  {
    accessorKey: "vacant",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Vacant" />,
    cell: ({ row }) => countCell(row.original.vacant, true),
  },
  {
    accessorKey: "unfunded",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Unfunded" />,
    cell: ({ row }) => countCell(row.original.unfunded, true),
  },
  {
    id: "download",
    header: "Employees",
    cell: ({ row }) => (
      <ExportExcelButton
        rows={row.original.incumbents}
        columns={INCUMBENT_EXPORT_COLUMNS}
        filename={positionFileSlug(row.original.title)}
        sheetName={row.original.title}
        label="Excel"
      />
    ),
  },
];

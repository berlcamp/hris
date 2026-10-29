"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/tables/data-table";
import { ExportExcelButton } from "@/components/tables/export-excel-button";
import {
  INCUMBENT_EXPORT_COLUMNS,
  positionSummaryColumns,
} from "@/components/tables/columns/position-summary-columns";
import type { XlsxColumn } from "@/lib/xlsx";
import { formatSalaryGradeRange, type PositionSummaryRow } from "@/lib/position-summary";

const SUMMARY_EXPORT_COLUMNS: XlsxColumn<PositionSummaryRow>[] = [
  { header: "Position", value: (r) => r.title },
  { header: "Salary Grade", value: (r) => formatSalaryGradeRange(r) },
  { header: "Items", value: (r) => r.total },
  { header: "Filled", value: (r) => r.filled },
  { header: "Vacant", value: (r) => r.vacant },
  { header: "Unfunded", value: (r) => r.unfunded },
  { header: "Employees", value: (r) => r.incumbents.length },
];

export function PositionSummaryReportClient({ rows }: { rows: PositionSummaryRow[] }) {
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  const filled = rows.reduce((sum, r) => sum + r.filled, 0);
  const vacant = rows.reduce((sum, r) => sum + r.vacant, 0);
  const unfunded = rows.reduce((sum, r) => sum + r.unfunded, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">Positions: {rows.length}</Badge>
        <Badge variant="outline">Items: {total}</Badge>
        <Badge variant="default">Filled: {filled}</Badge>
        <Badge variant="secondary">Vacant: {vacant}</Badge>
        <Badge variant="secondary">Unfunded: {unfunded}</Badge>
      </div>

      <DataTable
        columns={positionSummaryColumns}
        data={rows}
        searchableColumns={[{ id: "title", title: "position" }]}
        toolbar={(table) => {
          const visible = table.getFilteredRowModel().rows.map((r) => r.original);
          return (
            <>
              <ExportExcelButton
                rows={visible}
                columns={SUMMARY_EXPORT_COLUMNS}
                filename="position-summary"
                sheetName="Position Summary"
                label="Summary"
              />
              <ExportExcelButton
                rows={visible.flatMap((r) => r.incumbents)}
                columns={INCUMBENT_EXPORT_COLUMNS}
                filename="position-employees"
                sheetName="Employees by Position"
                label="All Employees"
              />
            </>
          );
        }}
      />
    </div>
  );
}

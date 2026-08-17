"use client";

import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildXlsx, XLSX_MIME_TYPE, type XlsxColumn } from "@/lib/xlsx";

interface ExportExcelButtonProps<TRow> {
  /**
   * The rows to write. Callers on a `<DataTable>` should pass the FILTERED row
   * model (`table.getFilteredRowModel().rows.map((r) => r.original)`) so the
   * download matches what the toolbar filters are showing — not the full data
   * set the page happened to load.
   */
  rows: TRow[];
  columns: XlsxColumn<TRow>[];
  /** Base name; the current date and `.xlsx` are appended. */
  filename: string;
  sheetName?: string;
  label?: string;
}

export function ExportExcelButton<TRow>({
  rows,
  columns,
  filename,
  sheetName = "Sheet1",
  label = "Export Excel",
}: ExportExcelButtonProps<TRow>) {
  const handleExport = () => {
    const bytes = buildXlsx({ sheetName, columns, rows });
    const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME_TYPE });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={rows.length === 0}
    >
      <FileSpreadsheet className="h-4 w-4" />
      {label}
      <span className="text-muted-foreground tabular-nums">
        ({rows.length})
      </span>
    </Button>
  );
}

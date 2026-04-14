"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CsvColumn {
  key: string;
  header: string;
}

interface ExportCsvButtonProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  filename: string;
  columns: CsvColumn[];
}

export function ExportCsvButton({ data, filename, columns }: ExportCsvButtonProps) {
  const handleExport = () => {
    const headers = columns.map((c) => c.header);
    const rows = data.map((row) =>
      columns.map((c) => {
        const val = row[c.key];
        const str = val == null ? "" : String(val);
        // Escape CSV values
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
    );

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="h-4 w-4" />
      Export CSV
    </Button>
  );
}

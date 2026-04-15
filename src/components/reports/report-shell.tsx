"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReportShellProps {
  title: string;
  children: React.ReactNode;
  onExportCsv?: () => string;
  fileName?: string;
  filters?: React.ReactNode;
}

export function ReportShell({
  title,
  children,
  onExportCsv,
  fileName = "report.csv",
  filters,
}: ReportShellProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = () => {
    if (!onExportCsv) return;
    setExporting(true);
    try {
      const csv = onExportCsv();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {filters && <div className="flex flex-wrap gap-3 items-end">{filters}</div>}

      {onExportCsv && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </Button>
        </div>
      )}

      {children}
    </div>
  );
}

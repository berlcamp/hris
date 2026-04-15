"use client";

import { useState } from "react";
import { Loader2, Download } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDtrSummaryExport } from "@/lib/actions/attendance-actions";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function DtrSummaryClient() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);

  const currentYear = now.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const handleExport = async () => {
    setLoading(true);
    try {
      const csv = await getDtrSummaryExport(Number(month), Number(year));
      if (!csv || csv.split("\n").length <= 1) {
        toast.error("No DTR data found for this period");
        return;
      }
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DTR_Summary_${monthNames[Number(month) - 1]}_${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("DTR summary exported");
    } catch {
      toast.error("Failed to export DTR summary");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Month</label>
          <Select value={month} onValueChange={(v) => v && setMonth(v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthNames.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Year</label>
          <Select value={year} onValueChange={(v) => v && setYear(v)}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleExport} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export DTR Summary CSV
        </Button>
      </div>

      <div className="rounded-lg border bg-muted/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Select a month and year, then click export to generate a CSV with per-employee attendance totals
          (days present, absent, late count, late minutes, undertime count, undertime minutes).
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          For individual employee DTR, use the{" "}
          <a href="/attendance/dtr" className="text-primary underline">
            Daily Time Record
          </a>{" "}
          page.
        </p>
      </div>
    </div>
  );
}

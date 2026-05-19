"use client";

import { useMemo, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pdf } from "@react-pdf/renderer";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDepartmentDtrBulk } from "@/lib/actions/attendance-actions";
import { formatManilaLongDate } from "@/lib/format-date";
import { BulkDtrPdf } from "@/components/pdf/bulk-dtr-pdf";

interface BulkDtrClientProps {
  departments: { id: string; name: string; code: string }[];
  defaultDepartmentId: string | null;
}

function firstOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function BulkDtrClient({
  departments,
  defaultDepartmentId,
}: BulkDtrClientProps) {
  const today = useMemo(() => new Date(), []);
  const [departmentId, setDepartmentId] = useState<string>(
    defaultDepartmentId ?? "",
  );
  const [startDate, setStartDate] = useState<string>(firstOfMonth(today));
  const [endDate, setEndDate] = useState<string>(todayIso(today));
  const [loading, setLoading] = useState(false);

  const canGenerate = departmentId && startDate && endDate && startDate <= endDate;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    try {
      const { department, results } = await getDepartmentDtrBulk(
        departmentId,
        startDate,
        endDate,
      );

      if (results.length === 0) {
        toast.info("No active employees found for the selected department.");
        return;
      }

      const periodLabel = `${formatManilaLongDate(startDate + "T00:00:00")} - ${formatManilaLongDate(endDate + "T00:00:00")}`;
      const deptName = department?.name ?? "";

      const blob = await pdf(
        <BulkDtrPdf results={results} periodLabel={periodLabel} />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeDept = (deptName || "Department").replace(/\s+/g, "_");
      a.download = `DTR_${safeDept}_${startDate}_to_${endDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Generated DTR for ${results.length} employee${results.length === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate bulk DTR",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Department
            </label>
            <Select
              value={departmentId}
              onValueChange={(v) => v && setDepartmentId(v)}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Date From
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[170px]"
              max={endDate || undefined}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Date To
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[170px]"
              min={startDate || undefined}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || loading}
            className="ml-auto"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Generate DTR PDF
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          One CSC Form 48 DTR page will be generated per active employee in the
          selected department. Approved leaves and weekend rows are reflected
          automatically.
        </p>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportShell } from "./report-shell";
import { getReportIpcrSummary } from "@/lib/actions/dashboard-actions";
import { getRatingColor } from "@/lib/ipcr-utils";
import type { IpcrPeriodRow } from "@/lib/actions/ipcr-actions";

interface IpcrRow {
  id: string;
  numerical_rating: number | null;
  adjectival_rating: string | null;
  status: string;
  employees: { employee_no: string; first_name: string; last_name: string; departments: { name: string } | null } | null;
  ipcr_periods: { name: string } | null;
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

interface IpcrSummaryClientProps {
  periods: IpcrPeriodRow[];
}

export function IpcrSummaryClient({ periods }: IpcrSummaryClientProps) {
  const activePeriod = periods.find((p) => p.is_active);
  const [periodId, setPeriodId] = useState(activePeriod?.id ?? periods[0]?.id ?? "");
  const [data, setData] = useState<IpcrRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!periodId) return;
    setLoading(true);
    try {
      const result = await getReportIpcrSummary(periodId);
      setData(result as unknown as IpcrRow[]);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [periodId]);

  const toCsv = () => {
    const headers = ["Employee No.", "Name", "Department", "Rating", "Adjectival", "Status", "Period"];
    const rows = data.map((r) => {
      const emp = r.employees;
      return [
        emp?.employee_no ?? "",
        emp ? `"${emp.last_name}, ${emp.first_name}"` : "",
        emp?.departments?.name ?? "",
        r.numerical_rating?.toFixed(2) ?? "",
        r.adjectival_rating ?? "",
        r.status,
        r.ipcr_periods?.name ?? "",
      ].join(",");
    });
    return [headers.join(","), ...rows].join("\n");
  };

  // Summary counts
  const approved = data.filter((r) => r.status === "approved");
  const avgRating = approved.length > 0
    ? approved.reduce((sum, r) => sum + (r.numerical_rating ?? 0), 0) / approved.length
    : 0;

  return (
    <ReportShell
      title="IPCR Summary"
      onExportCsv={data.length > 0 ? toCsv : undefined}
      fileName="ipcr_summary.csv"
      filters={
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Period</label>
            <Select value={periodId} onValueChange={(v) => v && setPeriodId(v)}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {p.is_active ? "(Active)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="outline">{data.length} record(s)</Badge>
          {approved.length > 0 && (
            <Badge variant="secondary">
              Avg: {avgRating.toFixed(2)}
            </Badge>
          )}
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Employee</TableHead>
                <TableHead className="text-xs">Department</TableHead>
                <TableHead className="text-xs text-center">Rating</TableHead>
                <TableHead className="text-xs text-center">Adjectival</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No records found.</TableCell>
                </TableRow>
              ) : (
                data.map((r) => {
                  const emp = r.employees;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">
                        {emp ? `${emp.last_name}, ${emp.first_name}` : "—"}
                        <br /><span className="text-muted-foreground font-mono">{emp?.employee_no}</span>
                      </TableCell>
                      <TableCell className="text-xs">{emp?.departments?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-center font-mono font-medium">
                        {r.numerical_rating?.toFixed(2) ?? "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.adjectival_rating ? (
                          <Badge variant="outline" className={`text-xs ${getRatingColor(r.adjectival_rating)}`}>
                            {r.adjectival_rating}
                          </Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={statusVariant[r.status] ?? "outline"} className="text-xs">{r.status}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </ReportShell>
  );
}

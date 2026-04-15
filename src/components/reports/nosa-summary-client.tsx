"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, CalendarIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ReportShell } from "./report-shell";
import { getReportNosaSummary } from "@/lib/actions/dashboard-actions";

interface NosaRow {
  id: string;
  effective_date: string;
  previous_salary_grade: number;
  previous_step: number;
  new_salary_grade: number;
  new_step: number;
  previous_salary: number;
  new_salary: number;
  reason: string;
  status: string;
  employees: { employee_no: string; first_name: string; last_name: string; departments: { name: string } | null } | null;
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

export function NosaSummaryClient() {
  const [data, setData] = useState<NosaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getReportNosaSummary(
        startDate ? format(startDate, "yyyy-MM-dd") : undefined,
        endDate ? format(endDate, "yyyy-MM-dd") : undefined
      );
      setData(result as unknown as NosaRow[]);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  const toCsv = () => {
    const headers = ["Employee No.", "Name", "Department", "From SG-Step", "To SG-Step", "Old Salary", "New Salary", "Reason", "Effective Date", "Status"];
    const rows = data.map((r) => {
      const emp = r.employees;
      return [
        emp?.employee_no ?? "",
        emp ? `"${emp.last_name}, ${emp.first_name}"` : "",
        emp?.departments?.name ?? "",
        `${r.previous_salary_grade}-${r.previous_step}`,
        `${r.new_salary_grade}-${r.new_step}`,
        r.previous_salary,
        r.new_salary,
        r.reason.replace(/_/g, " "),
        r.effective_date,
        r.status,
      ].join(",");
    });
    return [headers.join(","), ...rows].join("\n");
  };

  return (
    <ReportShell
      title="NOSA Summary"
      onExportCsv={data.length > 0 ? toCsv : undefined}
      fileName="nosa_summary.csv"
      filters={
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Popover open={startOpen} onOpenChange={setStartOpen}>
              <PopoverTrigger render={<Button variant="outline" className={cn("w-[160px] justify-start font-normal", !startDate && "text-muted-foreground")} />}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "MMM d, yyyy") : "Start date"}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setStartOpen(false); }} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Popover open={endOpen} onOpenChange={setEndOpen}>
              <PopoverTrigger render={<Button variant="outline" className={cn("w-[160px] justify-start font-normal", !endDate && "text-muted-foreground")} />}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "MMM d, yyyy") : "End date"}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setEndOpen(false); }} />
              </PopoverContent>
            </Popover>
          </div>
          {(startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setStartDate(undefined); setEndDate(undefined); }}>Clear</Button>
          )}
          <Badge variant="outline" className="ml-auto">{data.length} record(s)</Badge>
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
                <TableHead className="text-xs text-center">From</TableHead>
                <TableHead className="text-xs text-center">To</TableHead>
                <TableHead className="text-xs text-right">Difference</TableHead>
                <TableHead className="text-xs">Reason</TableHead>
                <TableHead className="text-xs">Effective</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No records found.</TableCell>
                </TableRow>
              ) : (
                data.map((r) => {
                  const emp = r.employees;
                  const diff = r.new_salary - r.previous_salary;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">
                        {emp ? `${emp.last_name}, ${emp.first_name}` : "—"}
                        <br /><span className="text-muted-foreground font-mono">{emp?.employee_no}</span>
                      </TableCell>
                      <TableCell className="text-xs">{emp?.departments?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-center">SG{r.previous_salary_grade}-{r.previous_step}</TableCell>
                      <TableCell className="text-xs text-center">SG{r.new_salary_grade}-{r.new_step}</TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        <span className={diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : ""}>
                          {diff > 0 ? "+" : ""}₱{diff.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs capitalize">{r.reason.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-xs">{format(new Date(r.effective_date), "MMM d, yyyy")}</TableCell>
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

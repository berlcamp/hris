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
import { getReportNosiSummary } from "@/lib/actions/dashboard-actions";

interface NosiRow {
  id: string;
  effective_date: string;
  current_salary_grade: number;
  current_step: number;
  new_step: number;
  current_salary: number;
  new_salary: number;
  status: string;
  employees: { employee_no: string; first_name: string; last_name: string; departments: { name: string } | null } | null;
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

export function NosiSummaryClient() {
  const [data, setData] = useState<NosiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getReportNosiSummary(
        startDate ? format(startDate, "yyyy-MM-dd") : undefined,
        endDate ? format(endDate, "yyyy-MM-dd") : undefined
      );
      setData(result as unknown as NosiRow[]);
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
    const headers = ["Employee No.", "Name", "Department", "SG", "From Step", "To Step", "Old Salary", "New Salary", "Effective Date", "Status"];
    const rows = data.map((r) => {
      const emp = r.employees;
      return [
        emp?.employee_no ?? "",
        emp ? `"${emp.last_name}, ${emp.first_name}"` : "",
        emp?.departments?.name ?? "",
        r.current_salary_grade,
        r.current_step,
        r.new_step,
        r.current_salary,
        r.new_salary,
        r.effective_date,
        r.status,
      ].join(",");
    });
    return [headers.join(","), ...rows].join("\n");
  };

  return (
    <ReportShell
      title="NOSI Summary"
      onExportCsv={data.length > 0 ? toCsv : undefined}
      fileName="nosi_summary.csv"
      filters={
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Popover open={startOpen} onOpenChange={setStartOpen}>
              <PopoverTrigger
                render={<Button variant="outline" className={cn("w-[160px] justify-start font-normal", !startDate && "text-muted-foreground")} />}
              >
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
              <PopoverTrigger
                render={<Button variant="outline" className={cn("w-[160px] justify-start font-normal", !endDate && "text-muted-foreground")} />}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "MMM d, yyyy") : "End date"}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setEndOpen(false); }} />
              </PopoverContent>
            </Popover>
          </div>
          {(startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setStartDate(undefined); setEndDate(undefined); }}>
              Clear
            </Button>
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
                <TableHead className="text-xs text-center">SG</TableHead>
                <TableHead className="text-xs text-center">Step</TableHead>
                <TableHead className="text-xs text-right">Old Salary</TableHead>
                <TableHead className="text-xs text-right">New Salary</TableHead>
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
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">
                        {emp ? `${emp.last_name}, ${emp.first_name}` : "—"}
                        <br />
                        <span className="text-muted-foreground font-mono">{emp?.employee_no}</span>
                      </TableCell>
                      <TableCell className="text-xs">{emp?.departments?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-center">{r.current_salary_grade}</TableCell>
                      <TableCell className="text-xs text-center">{r.current_step} → {r.new_step}</TableCell>
                      <TableCell className="text-xs text-right font-mono">₱{r.current_salary.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right font-mono">₱{r.new_salary.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{format(new Date(r.effective_date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={statusVariant[r.status] ?? "outline"} className="text-xs">
                          {r.status}
                        </Badge>
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

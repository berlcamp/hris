"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  getAttendanceReport,
  type AttendanceReportRow,
} from "@/lib/actions/attendance-actions";

interface AttendanceReportClientProps {
  departments: { id: string; name: string; code: string }[];
}

const ALL_DEPTS = "__all__";

function firstOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function AttendanceReportClient({
  departments,
}: AttendanceReportClientProps) {
  const today = useMemo(() => new Date(), []);
  const [departmentId, setDepartmentId] = useState<string>(ALL_DEPTS);
  const [startDate, setStartDate] = useState<string>(firstOfMonth(today));
  const [endDate, setEndDate] = useState<string>(todayIso(today));
  const [data, setData] = useState<AttendanceReportRow[]>([]);
  const [loading, setLoading] = useState(false);

  const canLoad = !!startDate && !!endDate && startDate <= endDate;

  const loadData = async () => {
    if (!canLoad) return;
    setLoading(true);
    try {
      const result = await getAttendanceReport(
        departmentId === ALL_DEPTS ? null : departmentId,
        startDate,
        endDate,
      );
      setData(result);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load report",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, startDate, endDate]);

  const totals = useMemo(() => {
    return data.reduce(
      (acc, r) => {
        acc.present += r.days_present;
        acc.absent += r.days_absent;
        acc.leave += r.days_on_leave;
        acc.lateMin += r.late_minutes;
        acc.utMin += r.undertime_minutes;
        acc.creditDays += r.leave_credit_days;
        return acc;
      },
      { present: 0, absent: 0, leave: 0, lateMin: 0, utMin: 0, creditDays: 0 },
    );
  }, [data]);

  const toCsv = () => {
    const headers = [
      "Employee",
      "Department",
      "Schedule",
      "Days Present",
      "Days Absent",
      "Days on Leave",
      "Late Count",
      "Total Late (mins)",
      "Undertime Count",
      "Total Undertime (mins)",
      "Total Deficit (mins)",
      "Leave Credit Days (0.125/hr)",
    ];
    const rows = data.map((r) =>
      [
        `"${r.employee_name.replace(/"/g, '""')}"`,
        `"${(r.department_name ?? "").replace(/"/g, '""')}"`,
        `"${r.schedule_name.replace(/"/g, '""')}"`,
        r.days_present,
        r.days_absent,
        r.days_on_leave,
        r.late_count,
        r.late_minutes,
        r.undertime_count,
        r.undertime_minutes,
        r.total_deficit_minutes,
        r.leave_credit_days.toFixed(3),
      ].join(","),
    );
    return [headers.join(","), ...rows].join("\n");
  };

  const fileName = `Attendance_Report_${startDate}_to_${endDate}.csv`;

  return (
    <ReportShell
      title="Attendance Report"
      onExportCsv={data.length > 0 ? toCsv : undefined}
      fileName={fileName}
      filters={
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Department
            </label>
            <Select
              value={departmentId}
              onValueChange={(v) => v && setDepartmentId(v)}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DEPTS}>All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.code} — {d.name}
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

          <Badge variant="outline" className="ml-auto">
            {data.length} employee{data.length === 1 ? "" : "s"}
          </Badge>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Employee</TableHead>
                <TableHead className="text-xs">Department</TableHead>
                <TableHead className="text-xs">Schedule</TableHead>
                <TableHead className="text-xs text-right">Present</TableHead>
                <TableHead className="text-xs text-right">Absent</TableHead>
                <TableHead className="text-xs text-right">Leave</TableHead>
                <TableHead className="text-xs text-right">Late (×)</TableHead>
                <TableHead className="text-xs text-right">Late (m)</TableHead>
                <TableHead className="text-xs text-right">UT (×)</TableHead>
                <TableHead className="text-xs text-right">UT (m)</TableHead>
                <TableHead className="text-xs text-right">Credits (d)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="text-center text-muted-foreground py-8 text-sm"
                  >
                    No employees match the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {data.map((r) => (
                    <TableRow key={r.employee_id}>
                      <TableCell className="text-xs font-medium">
                        {r.employee_name}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.department_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.schedule_name}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-green-600">
                        {r.days_present}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-destructive">
                        {r.days_absent}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-blue-600">
                        {r.days_on_leave}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {r.late_count}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {r.late_minutes}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {r.undertime_count}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {r.undertime_minutes}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-semibold">
                        {r.leave_credit_days.toFixed(3)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell className="text-xs" colSpan={3}>
                      Totals ({data.length})
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {totals.present}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {totals.absent}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {totals.leave}
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-xs text-right tabular-nums">
                      {totals.lateMin}
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-xs text-right tabular-nums">
                      {totals.utMin}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {totals.creditDays.toFixed(3)}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </ReportShell>
  );
}

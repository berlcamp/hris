"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Check, ChevronsUpDown, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pdf } from "@react-pdf/renderer";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  getDtrData,
  getDtrSummaryExport,
} from "@/lib/actions/attendance-actions";
import type {
  DtrEntry,
  DtrSummary,
} from "@/lib/actions/attendance-actions";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";
import { DtrPdf } from "@/components/pdf/dtr-pdf";

interface DtrViewClientProps {
  employees: EmployeeWithRelations[];
  isAdmin: boolean;
  currentEmployeeId: string | null;
}

const months = [
  { label: "January", value: "1" },
  { label: "February", value: "2" },
  { label: "March", value: "3" },
  { label: "April", value: "4" },
  { label: "May", value: "5" },
  { label: "June", value: "6" },
  { label: "July", value: "7" },
  { label: "August", value: "8" },
  { label: "September", value: "9" },
  { label: "October", value: "10" },
  { label: "November", value: "11" },
  { label: "December", value: "12" },
];

function TimeBadge({ time }: { time: string | null }) {
  if (!time) return <span className="text-muted-foreground">—</span>;
  return <span className="font-mono text-xs">{time}</span>;
}

export function DtrViewClient({
  employees,
  isAdmin,
  currentEmployeeId,
}: DtrViewClientProps) {
  const now = new Date();
  const [employeeId, setEmployeeId] = useState<string>(currentEmployeeId ?? "");
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [empOpen, setEmpOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  const [entries, setEntries] = useState<DtrEntry[]>([]);
  const [summary, setSummary] = useState<DtrSummary | null>(null);
  const [employeeInfo, setEmployeeInfo] = useState<{
    employee_no: string;
    first_name: string;
    last_name: string;
    middle_name: string | null;
    departments: { name: string } | null;
    positions: { title: string } | null;
  } | null>(null);

  const selectedEmployee = employees.find((e) => e.id === employeeId);

  const currentYear = now.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const loadDtr = async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const data = await getDtrData(employeeId, Number(month), Number(year));
      setEntries(data.entries);
      setSummary(data.summary);
      setEmployeeInfo(data.employee);
    } catch {
      toast.error("Failed to load DTR data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employeeId) {
      loadDtr();
    }
  }, [employeeId, month, year]);

  const handleExportPdf = async () => {
    if (!employeeInfo || !summary) return;
    setPdfLoading(true);
    try {
      const monthName = months.find((m) => m.value === month)?.label ?? "";
      const blob = await pdf(
        <DtrPdf
          entries={entries}
          summary={summary}
          employee={employeeInfo}
          month={monthName}
          year={year}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DTR_${employeeInfo.last_name}_${monthName}_${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExportCsv = async () => {
    setCsvLoading(true);
    try {
      const csv = await getDtrSummaryExport(Number(month), Number(year));
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const monthName = months.find((m) => m.value === month)?.label ?? "";
      a.download = `DTR_Summary_${monthName}_${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export CSV");
    } finally {
      setCsvLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Employee selector */}
        {isAdmin ? (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Employee
            </label>
            <Popover open={empOpen} onOpenChange={setEmpOpen}>
              <PopoverTrigger
                render={<Button variant="outline" role="combobox" className="w-[280px] justify-between font-normal" />}
              >
                {selectedEmployee
                  ? `${selectedEmployee.last_name}, ${selectedEmployee.first_name}`
                  : "Select employee..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search employee..." />
                  <CommandList>
                    <CommandEmpty>No employee found.</CommandEmpty>
                    <CommandGroup>
                      {employees.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={`${emp.last_name} ${emp.first_name} ${emp.employee_no}`}
                          onSelect={() => {
                            setEmployeeId(emp.id);
                            setEmpOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              employeeId === emp.id
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <div>
                            <p className="text-sm">
                              {emp.last_name}, {emp.first_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {emp.employee_no}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          selectedEmployee && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Employee
              </label>
              <div className="h-9 flex items-center px-3 border rounded-md bg-muted/50 text-sm">
                {selectedEmployee.last_name}, {selectedEmployee.first_name}
              </div>
            </div>
          )
        )}

        {/* Month */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Month
          </label>
          <Select value={month} onValueChange={(v) => v && setMonth(v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Year */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Year
          </label>
          <Select value={year} onValueChange={(v) => v && setYear(v)}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Export buttons */}
        {entries.length > 0 && (
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={pdfLoading}
            >
              {pdfLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              DTR PDF
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={csvLoading}
              >
                {csvLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Summary CSV
              </Button>
            )}
          </div>
        )}
      </div>

      {/* DTR Table */}
      {!employeeId ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">Select an employee to view their DTR</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <ScrollArea className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[100px]">Date</TableHead>
                  <TableHead className="text-xs w-[80px]">Day</TableHead>
                  <TableHead className="text-xs text-center">AM In</TableHead>
                  <TableHead className="text-xs text-center">AM Out</TableHead>
                  <TableHead className="text-xs text-center">PM In</TableHead>
                  <TableHead className="text-xs text-center">PM Out</TableHead>
                  <TableHead className="text-xs text-center">Late</TableHead>
                  <TableHead className="text-xs text-center">UT</TableHead>
                  <TableHead className="text-xs">Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const isWeekend =
                    entry.day_of_week === "Saturday" ||
                    entry.day_of_week === "Sunday";
                  return (
                    <TableRow
                      key={entry.date}
                      className={cn(
                        isWeekend && "bg-muted/50",
                        entry.is_absent && !isWeekend && "bg-destructive/5"
                      )}
                    >
                      <TableCell className="text-xs font-mono">
                        {format(new Date(entry.date + "T00:00:00"), "MMM d")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.day_of_week.slice(0, 3)}
                      </TableCell>
                      <TableCell className="text-center">
                        <TimeBadge time={entry.time_in_am} />
                      </TableCell>
                      <TableCell className="text-center">
                        <TimeBadge time={entry.time_out_am} />
                      </TableCell>
                      <TableCell className="text-center">
                        <TimeBadge time={entry.time_in_pm} />
                      </TableCell>
                      <TableCell className="text-center">
                        <TimeBadge time={entry.time_out_pm} />
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.is_late ? (
                          <Badge variant="secondary" className="text-xs">
                            {entry.late_minutes}m
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.is_undertime ? (
                          <Badge variant="secondary" className="text-xs">
                            {entry.undertime_minutes}m
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.is_absent && !isWeekend ? (
                          <Badge variant="destructive" className="text-xs">
                            Absent
                          </Badge>
                        ) : (
                          entry.remarks ?? ""
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Summary Card */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-2xl font-bold text-green-600">
                    {summary.total_days_present}
                  </p>
                  <p className="text-xs text-muted-foreground">Days Present</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-2xl font-bold text-destructive">
                    {summary.total_days_absent}
                  </p>
                  <p className="text-xs text-muted-foreground">Days Absent</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-2xl font-bold">
                    {summary.total_late_count}
                  </p>
                  <p className="text-xs text-muted-foreground">Times Late</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-2xl font-bold">
                    {summary.total_late_minutes}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Late Minutes
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-2xl font-bold">
                    {summary.total_undertime_count}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Undertime Count
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-2xl font-bold">
                    {summary.total_undertime_minutes}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    UT Minutes
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

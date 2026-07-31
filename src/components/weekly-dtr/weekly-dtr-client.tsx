"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { pdf } from "@react-pdf/renderer";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { commandSubstringFilter } from "@/lib/command-filter";
import {
  getWeeklyDtrBulk,
  getWeeklyDtrForEmployee,
  getWeeklyDtrRoster,
  type WeeklyDtrEmployee,
} from "@/lib/actions/weekly-dtr-actions";
import {
  formatWeekLabel,
  shiftWeeks,
  weekFileLabel,
} from "@/lib/week-range";
import { BulkDtrPdf } from "@/components/pdf/bulk-dtr-pdf";
import type { BulkDtrResult } from "@/lib/dtr-builder";

interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

interface WeeklyDtrClientProps {
  /** Selectable departments. Empty for department-scoped users. */
  departments: DepartmentOption[];
  /** The one department a department-scoped user may generate for. */
  lockedDepartment: DepartmentOption | null;
  currentWeekStart: string;
}

function safeName(value: string) {
  return (value || "DTR").replace(/[^\w-]+/g, "_");
}

function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function WeeklyDtrClient({
  departments,
  lockedDepartment,
  currentWeekStart,
}: WeeklyDtrClientProps) {
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [departmentId, setDepartmentId] = useState<string>(
    lockedDepartment?.id ?? "",
  );
  const [employeeId, setEmployeeId] = useState<string>("");
  const [empOpen, setEmpOpen] = useState(false);

  const [roster, setRoster] = useState<WeeklyDtrEmployee[]>([]);
  // Distinguishes "no roster loaded yet" from "loaded, and nobody has entries".
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [loadingRoster, startRosterLoad] = useTransition();
  const [busy, setBusy] = useState<"bulk" | "single" | null>(null);

  const departmentItems = Object.fromEntries(
    departments.map((d) => [d.id, d.name]),
  );
  const canQuery = !!departmentId || !!lockedDepartment;

  // The roster is the module's availability answer: it comes back holding only
  // the employees who actually have time entries in the week, so an employee
  // missing from the picker is precisely an employee with no DTR to download.
  useEffect(() => {
    if (!canQuery) {
      setRoster([]);
      setRosterLoaded(false);
      return;
    }
    let cancelled = false;
    setRosterLoaded(false);
    startRosterLoad(async () => {
      try {
        const { employees } = await getWeeklyDtrRoster(
          lockedDepartment ? null : departmentId,
          weekStart,
        );
        if (cancelled) return;
        setRoster(employees);
        setRosterLoaded(true);
        // Drop a selection that this week has no entries for, so the Download
        // button can never act on a stale employee.
        setEmployeeId((current) =>
          employees.some((e) => e.id === current) ? current : "",
        );
      } catch (err) {
        if (cancelled) return;
        setRoster([]);
        setRosterLoaded(true);
        toast.error(
          err instanceof Error ? err.message : "Failed to load the roster",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [departmentId, weekStart, canQuery, lockedDepartment]);

  const render = useCallback(
    async (results: BulkDtrResult[], filename: string) => {
      const blob = await pdf(
        <BulkDtrPdf results={results} periodLabel={formatWeekLabel(weekStart)} />,
      ).toBlob();
      downloadPdf(blob, filename);
    },
    [weekStart],
  );

  const handleBulk = async () => {
    setBusy("bulk");
    try {
      const { department, results } = await getWeeklyDtrBulk(
        lockedDepartment ? null : departmentId,
        weekStart,
      );
      if (results.length === 0) {
        toast.info("No DTRs are available for this week yet.");
        return;
      }
      const deptName = department?.code || department?.name || "Department";
      await render(
        results,
        `Weekly_DTR_${safeName(deptName)}_${weekFileLabel(weekStart)}.pdf`,
      );
      toast.success(
        `Downloaded ${results.length} DTR${results.length === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate the DTRs",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleSingle = async () => {
    if (!employeeId) return;
    setBusy("single");
    try {
      const result = await getWeeklyDtrForEmployee(
        lockedDepartment ? null : departmentId,
        weekStart,
        employeeId,
      );
      if (!result) {
        toast.error("That employee has no DTR available for this week.");
        return;
      }
      await render(
        [result],
        `DTR_${safeName(result.employee.last_name)}_${weekFileLabel(weekStart)}.pdf`,
      );
      toast.success("DTR downloaded.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate the DTR",
      );
    } finally {
      setBusy(null);
    }
  };

  const selected = roster.find((e) => e.id === employeeId);
  const available = roster.length;

  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          {!lockedDepartment && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Department
              </label>
              <Select
                items={departmentItems}
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
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Week
            </label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous week"
                onClick={() => setWeekStart((w) => shiftWeeks(w, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="h-9 min-w-[240px] flex items-center justify-center px-3 border rounded-md text-sm font-medium tabular-nums">
                {formatWeekLabel(weekStart)}
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next week"
                onClick={() => setWeekStart((w) => shiftWeeks(w, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {weekStart !== currentWeekStart && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWeekStart(currentWeekStart)}
                >
                  This week
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          {!canQuery ? (
            "Select a department to see which DTRs are available."
          ) : loadingRoster || !rosterLoaded ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking which DTRs are available…
            </span>
          ) : available === 0 ? (
            "No time entries were recorded for this department in this week, so there is nothing to download."
          ) : (
            `${available} employee${available === 1 ? "" : "s"} ${available === 1 ? "has" : "have"} a DTR available for this week.`
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t pt-5">
          <Button
            onClick={handleBulk}
            disabled={!canQuery || available === 0 || busy !== null}
          >
            {busy === "bulk" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Download all {available > 0 ? `(${available})` : ""}
          </Button>

          <span className="text-xs text-muted-foreground pb-2.5">or</span>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              One employee
            </label>
            <Popover open={empOpen} onOpenChange={setEmpOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={available === 0}
                    className="w-[280px] h-9 justify-between font-normal"
                  />
                }
              >
                {selected ? selected.name : "Select employee..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <Command filter={commandSubstringFilter}>
                  <CommandInput placeholder="Search employee..." />
                  <CommandList>
                    <CommandEmpty>No employee found.</CommandEmpty>
                    <CommandGroup>
                      {roster.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={emp.name}
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
                                : "opacity-0",
                            )}
                          />
                          <div className="min-w-0">
                            <p className="text-sm truncate">{emp.name}</p>
                            {emp.position && (
                              <p className="text-xs text-muted-foreground truncate">
                                {emp.position}
                              </p>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <Button
            variant="outline"
            onClick={handleSingle}
            disabled={!employeeId || busy !== null}
          >
            {busy === "single" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Each DTR covers Monday to Sunday of the selected week. Approved leaves,
          declared holidays and weekend rows are reflected automatically, and the
          signatory is resolved from the department the employee is assigned or
          detailed to.
        </p>
      </CardContent>
    </Card>
  );
}

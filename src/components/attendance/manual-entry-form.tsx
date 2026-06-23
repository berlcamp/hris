"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
import { cn } from "@/lib/utils";
import {
  createAttendanceEntry,
  createAttendanceEntriesBulk,
} from "@/lib/actions/attendance-actions";
import type { ScheduleRow } from "@/lib/actions/schedule-actions";
import {
  NO_TIME_REASONS,
  NO_TIME_REASON_LABELS,
  type NoTimeReason,
} from "@/lib/constants";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";
import { addDays, format } from "date-fns";
import { CalendarIcon } from "lucide-react";

// One editable row in date-range mode: the four punch times for a single date.
interface RangeRow {
  amIn: string;
  amOut: string;
  pmIn: string;
  pmOut: string;
}
const EMPTY_RANGE_ROW: RangeRow = { amIn: "", amOut: "", pmIn: "", pmOut: "" };

interface ManualEntryInitialValues {
  employeeId: string;
  date: string; // yyyy-MM-dd
  scheduleId: string | null;
  timeInAm: string;
  timeOutAm: string;
  timeInPm: string;
  timeOutPm: string;
  remarks: string;
  reasonInAm: NoTimeReason | null;
  reasonOutAm: NoTimeReason | null;
  reasonInPm: NoTimeReason | null;
  reasonOutPm: NoTimeReason | null;
}

// Sentinel for the "no reason" option, since the Select can't hold an empty value.
const NO_REASON = "none";

// Sentinel for "inherit the employee's assigned schedule" (no per-day override).
const INHERIT_SCHEDULE = "inherit";

const toScheduleId = (v: string): string | null =>
  v === INHERIT_SCHEDULE ? null : v;

// "Regular 8:00 AM – 5:00 PM (08:00–17:00)" — name plus the shift window.
function scheduleLabel(s: ScheduleRow): string {
  return `${s.name} (${s.time_in}–${s.time_out})`;
}

const toReason = (v: string): NoTimeReason | null =>
  v === NO_REASON ? null : (v as NoTimeReason);

const REASON_ITEMS = { [NO_REASON]: "No reason", ...NO_TIME_REASON_LABELS };

// A time field paired with an official-duty reason selector. Enter a time OR
// pick a reason for the blank slot (the DTR prints the reason instead of a
// time); the two are mutually exclusive.
function TimeReasonField({
  id,
  label,
  time,
  onTime,
  reason,
  onReason,
}: {
  id: string;
  label: string;
  time: string;
  onTime: (v: string) => void;
  reason: string;
  onReason: (v: string) => void;
}) {
  const hasReason = reason !== NO_REASON;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="time"
        value={time}
        onChange={(e) => onTime(e.target.value)}
        disabled={hasReason}
      />
      <Select
        items={REASON_ITEMS}
        value={reason}
        onValueChange={(v) => v && onReason(v)}
        disabled={!!time}
      >
        <SelectTrigger className="w-full" size="sm">
          <SelectValue placeholder="No reason" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_REASON}>No reason</SelectItem>
          {NO_TIME_REASONS.map((r) => (
            <SelectItem key={r} value={r}>
              {NO_TIME_REASON_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// One grid row in date-range mode: a date label plus its four punch-time inputs.
function RangeDateRow({
  dateStr,
  row,
  onCell,
}: {
  dateStr: string;
  row: RangeRow;
  onCell: (d: string, key: keyof RangeRow, value: string) => void;
}) {
  const labelDate = new Date(dateStr + "T00:00:00");
  return (
    <>
      <div className="flex items-center border-t px-3 py-1.5">
        <span className="font-medium">{format(labelDate, "EEE, MMM d")}</span>
      </div>
      {(["amIn", "amOut", "pmIn", "pmOut"] as const).map((key) => (
        <div key={key} className="border-t px-2 py-1.5">
          <Input
            type="time"
            aria-label={`${format(labelDate, "MMM d")} ${key}`}
            value={row[key]}
            onChange={(e) => onCell(dateStr, key, e.target.value)}
            className="h-8"
          />
        </div>
      ))}
    </>
  );
}

interface ManualEntryFormProps {
  employees: EmployeeWithRelations[];
  schedules: ScheduleRow[];
  initialValues?: ManualEntryInitialValues;
}

export function ManualEntryForm({ employees, schedules, initialValues }: ManualEntryFormProps) {
  const router = useRouter();
  const isEdit = !!initialValues;
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>(initialValues?.employeeId ?? "");
  // Per-day schedule override; INHERIT_SCHEDULE = use the employee's assigned one.
  const [scheduleId, setScheduleId] = useState<string>(
    initialValues?.scheduleId ?? INHERIT_SCHEDULE,
  );
  // value -> label map so the Select trigger shows the schedule name (not the
  // raw UUID) for the current selection.
  const scheduleItems = useMemo(() => {
    const items: Record<string, string> = {
      [INHERIT_SCHEDULE]: "Use employee's assigned schedule",
    };
    for (const s of schedules) items[s.id] = scheduleLabel(s);
    return items;
  }, [schedules]);
  const [date, setDate] = useState<Date | undefined>(
    initialValues?.date ? new Date(initialValues.date + "T00:00:00") : new Date(),
  );
  // Date-range mode (create only) shows a row per date so each day's punch
  // times can be entered quickly in one grid.
  const [rangeMode, setRangeMode] = useState(false);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [endDateOpen, setEndDateOpen] = useState(false);
  // Per-date punch times, keyed by yyyy-MM-dd.
  const [rangeRows, setRangeRows] = useState<Record<string, RangeRow>>({});
  const [timeInAm, setTimeInAm] = useState(initialValues?.timeInAm ?? "");
  const [timeOutAm, setTimeOutAm] = useState(initialValues?.timeOutAm ?? "");
  const [timeInPm, setTimeInPm] = useState(initialValues?.timeInPm ?? "");
  const [timeOutPm, setTimeOutPm] = useState(initialValues?.timeOutPm ?? "");
  const [remarks, setRemarks] = useState(initialValues?.remarks ?? "");
  const [reasonInAm, setReasonInAm] = useState<string>(
    initialValues?.reasonInAm ?? NO_REASON,
  );
  const [reasonOutAm, setReasonOutAm] = useState<string>(
    initialValues?.reasonOutAm ?? NO_REASON,
  );
  const [reasonInPm, setReasonInPm] = useState<string>(
    initialValues?.reasonInPm ?? NO_REASON,
  );
  const [reasonOutPm, setReasonOutPm] = useState<string>(
    initialValues?.reasonOutPm ?? NO_REASON,
  );
  const [empOpen, setEmpOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const selectedEmployee = employees.find((e) => e.id === employeeId);

  const useRange = rangeMode && !isEdit;

  // The dates the grid renders a row for, respecting the weekend filter.
  const rangeDates = useMemo(() => {
    if (!useRange || !date || !endDate) return [];
    const end = format(endDate, "yyyy-MM-dd");
    if (format(date, "yyyy-MM-dd") > end) return [];
    const out: string[] = [];
    let cursor = date;
    for (let i = 0; i <= 366 && format(cursor, "yyyy-MM-dd") <= end; i++) {
      const dow = cursor.getDay();
      const isWeekend = dow === 0 || dow === 6;
      if (!skipWeekends || !isWeekend) out.push(format(cursor, "yyyy-MM-dd"));
      cursor = addDays(cursor, 1);
    }
    return out;
  }, [useRange, date, endDate, skipWeekends]);

  const getRow = (d: string): RangeRow => rangeRows[d] ?? EMPTY_RANGE_ROW;
  const setCell = (d: string, key: keyof RangeRow, value: string) =>
    setRangeRows((prev) => ({
      ...prev,
      [d]: { ...EMPTY_RANGE_ROW, ...prev[d], [key]: value },
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !date) {
      toast.error("Please select an employee and date");
      return;
    }
    // In range mode, gather only the date rows that have at least one punch
    // time — blank rows are skipped so existing logs aren't overwritten.
    let bulkEntries: {
      date: string;
      time_in_am: string | null;
      time_out_am: string | null;
      time_in_pm: string | null;
      time_out_pm: string | null;
      schedule_id: string | null;
    }[] = [];
    if (useRange) {
      if (!endDate) {
        toast.error("Please pick an end date for the range");
        return;
      }
      if (rangeDates.length === 0) {
        toast.error("No dates in range (all weekends were skipped)");
        return;
      }
      bulkEntries = rangeDates
        .map((d) => ({ d, row: getRow(d) }))
        .filter(({ row }) => row.amIn || row.amOut || row.pmIn || row.pmOut)
        .map(({ d, row }) => ({
          date: d,
          time_in_am: row.amIn || null,
          time_out_am: row.amOut || null,
          time_in_pm: row.pmIn || null,
          time_out_pm: row.pmOut || null,
          schedule_id: toScheduleId(scheduleId),
        }));
      if (bulkEntries.length === 0) {
        toast.error("Enter at least one time on one of the dates");
        return;
      }
    }

    setLoading(true);
    try {
      if (useRange) {
        const { count } = await createAttendanceEntriesBulk({
          employee_id: employeeId,
          entries: bulkEntries,
        });
        toast.success(`Saved attendance for ${count} day${count === 1 ? "" : "s"}`);
      } else {
        await createAttendanceEntry({
          employee_id: employeeId,
          date: format(date, "yyyy-MM-dd"),
          time_in_am: timeInAm || null,
          time_out_am: timeOutAm || null,
          time_in_pm: timeInPm || null,
          time_out_pm: timeOutPm || null,
          remarks: remarks || undefined,
          schedule_id: toScheduleId(scheduleId),
          reason_in_am: toReason(reasonInAm),
          reason_out_am: toReason(reasonOutAm),
          reason_in_pm: toReason(reasonInPm),
          reason_out_pm: toReason(reasonOutPm),
        });
        toast.success(isEdit ? "Attendance entry updated" : "Attendance entry saved");
      }
      router.push("/attendance");
    } catch {
      toast.error("Failed to save attendance entry");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Attendance Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Employee Selector */}
          <div className="space-y-2">
            <Label>Employee</Label>
            <Popover open={empOpen} onOpenChange={setEmpOpen}>
              <PopoverTrigger
                disabled={isEdit}
                render={<Button variant="outline" role="combobox" disabled={isEdit} className="w-full justify-between font-normal" />}
              >
                {selectedEmployee
                  ? `${selectedEmployee.last_name}, ${selectedEmployee.first_name}`
                  : "Select employee..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search employee..." />
                  <CommandList>
                    <CommandEmpty>No employee found.</CommandEmpty>
                    <CommandGroup>
                      {employees.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={`${emp.last_name} ${emp.first_name}`}
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
                            <p className="text-sm font-medium">
                              {emp.last_name}, {emp.first_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {emp.departments?.name ?? "No Dept"}
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

          {/* Date mode toggle (create only) */}
          {!isEdit && (
            <div className="flex items-center gap-2 rounded-md border p-3">
              <Checkbox
                id="range_mode"
                checked={rangeMode}
                onCheckedChange={(v) => setRangeMode(v === true)}
              />
              <Label htmlFor="range_mode" className="font-normal">
                Apply to a date range
              </Label>
            </div>
          )}

          {/* Date */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{useRange ? "Start date" : "Date"}</Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger
                  disabled={isEdit}
                  render={
                    <Button
                      variant="outline"
                      disabled={isEdit}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                    />
                  }
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "MMMM d, yyyy") : "Pick a date"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      setDate(d);
                      setDateOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {useRange && (
              <div className="space-y-2">
                <Label>End date</Label>
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !endDate && "text-muted-foreground"
                        )}
                      />
                    }
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "MMMM d, yyyy") : "Pick a date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(d) => {
                        setEndDate(d);
                        setEndDateOpen(false);
                      }}
                      disabled={date ? { before: date } : undefined}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {useRange && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="skip_weekends"
                checked={skipWeekends}
                onCheckedChange={(v) => setSkipWeekends(v === true)}
              />
              <Label htmlFor="skip_weekends" className="font-normal">
                Skip weekends (Saturdays &amp; Sundays)
              </Label>
            </div>
          )}

          {/* Schedule override */}
          <div className="space-y-2">
            <Label>Schedule</Label>
            <Select
              items={scheduleItems}
              value={scheduleId}
              onValueChange={(v) => v && setScheduleId(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Use employee's assigned schedule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INHERIT_SCHEDULE}>
                  Use employee&apos;s assigned schedule
                </SelectItem>
                {schedules.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {scheduleLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {useRange
                ? "Applied to every date in this range. Pick a specific shift for employees who rotate schedules, or leave as the employee's assigned schedule."
                : "Pin a specific shift for this day (for employees who change schedules daily or weekly). Late and undertime are computed against the chosen schedule."}
            </p>
          </div>

          {/* Per-date grid (range mode) */}
          {useRange ? (
            <div className="space-y-2">
              <Label>Daily times</Label>
              <div className="overflow-x-auto rounded-md border">
                <div className="grid grid-cols-[minmax(8rem,1.4fr)_repeat(4,minmax(5rem,1fr))] text-sm">
                  <div className="bg-muted/50 px-3 py-2 font-medium">Date</div>
                  <div className="bg-muted/50 px-3 py-2 font-medium">AM In</div>
                  <div className="bg-muted/50 px-3 py-2 font-medium">AM Out</div>
                  <div className="bg-muted/50 px-3 py-2 font-medium">PM In</div>
                  <div className="bg-muted/50 px-3 py-2 font-medium">PM Out</div>
                  {rangeDates.map((d) => {
                    const row = getRow(d);
                    return (
                      <RangeDateRow
                        key={d}
                        dateStr={d}
                        row={row}
                        onCell={setCell}
                      />
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the punch times for each day. Dates left completely blank
                are skipped (existing logs are not overwritten).
              </p>
            </div>
          ) : (
            <>
              {/* Time Inputs + per-slot reason */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Morning (AM)</h4>
                    <TimeReasonField
                      id="time_in_am"
                      label="Time In"
                      time={timeInAm}
                      onTime={setTimeInAm}
                      reason={reasonInAm}
                      onReason={setReasonInAm}
                    />
                    <TimeReasonField
                      id="time_out_am"
                      label="Time Out"
                      time={timeOutAm}
                      onTime={setTimeOutAm}
                      reason={reasonOutAm}
                      onReason={setReasonOutAm}
                    />
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Afternoon (PM)</h4>
                    <TimeReasonField
                      id="time_in_pm"
                      label="Time In"
                      time={timeInPm}
                      onTime={setTimeInPm}
                      reason={reasonInPm}
                      onReason={setReasonInPm}
                    />
                    <TimeReasonField
                      id="time_out_pm"
                      label="Time Out"
                      time={timeOutPm}
                      onTime={setTimeOutPm}
                      reason={reasonOutPm}
                      onReason={setReasonOutPm}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  For a blank slot, pick a reason (TRAVEL, FIELD WORK, OFFICIAL
                  BUSINESS) instead of a time. The DTR prints the reason in that
                  cell and does not charge tardiness/undertime for it.
                </p>
              </div>

              {/* Remarks */}
              <div className="space-y-2">
                <Label htmlFor="remarks">Remarks (optional)</Label>
                <Textarea
                  id="remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g., Official business, half-day..."
                  rows={2}
                />
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/attendance")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {useRange ? "Save Range" : isEdit ? "Update Entry" : "Save Entry"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

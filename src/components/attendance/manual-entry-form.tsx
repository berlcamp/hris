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
import { employeeSearchKeywords } from "@/lib/employee-name-match";
import { commandSubstringFilter } from "@/lib/command-filter";
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

// One editable row in the per-date grid: four punch times, a reason per slot,
// and an optional schedule pin for that single date. The reasons matter on
// their own — a day with a reason and no times is a deliberate non-duty day
// (SATURDAY, LEAVE, OFF), not a blank row, and must still be saved.
interface RangeRow {
  amIn: string;
  amOut: string;
  pmIn: string;
  pmOut: string;
  reasonAmIn: string;
  reasonAmOut: string;
  reasonPmIn: string;
  reasonPmOut: string;
  /** INHERIT_SCHEDULE, or a schedule id pinned to this date alone. */
  scheduleId: string;
}

/** The time input and reason select that make up one slot of a grid row. */
const SLOTS = [
  { time: "amIn", reason: "reasonAmIn", label: "AM In" },
  { time: "amOut", reason: "reasonAmOut", label: "AM Out" },
  { time: "pmIn", reason: "reasonPmIn", label: "PM In" },
  { time: "pmOut", reason: "reasonPmOut", label: "PM Out" },
] as const satisfies readonly {
  time: keyof RangeRow;
  reason: keyof RangeRow;
  label: string;
}[];

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

// Declared after the two sentinels it uses — a const initialiser cannot reach
// forward past its own temporal dead zone.
const EMPTY_RANGE_ROW: RangeRow = {
  amIn: "",
  amOut: "",
  pmIn: "",
  pmOut: "",
  reasonAmIn: NO_REASON,
  reasonAmOut: NO_REASON,
  reasonPmIn: NO_REASON,
  reasonPmOut: NO_REASON,
  scheduleId: INHERIT_SCHEDULE,
};

/** True if the row says anything at all — a time, a reason, or a schedule pin. */
function rowHasContent(row: RangeRow): boolean {
  return (
    !!row.amIn ||
    !!row.amOut ||
    !!row.pmIn ||
    !!row.pmOut ||
    // A reason with no times is the whole point of tagging a rest day, so it
    // has to count as content or the row would be silently skipped.
    SLOTS.some((s) => row[s.reason] !== NO_REASON) ||
    row.scheduleId !== INHERIT_SCHEDULE
  );
}

// "Regular 8:00 AM – 5:00 PM (08:00–17:00)" — name plus the shift window.
function scheduleLabel(s: ScheduleRow): string {
  return `${s.name} (${s.time_in}–${s.time_out})`;
}

const toReason = (v: string): NoTimeReason | null =>
  v === NO_REASON ? null : (v as NoTimeReason);

const REASON_ITEMS = { [NO_REASON]: "No reason", ...NO_TIME_REASON_LABELS };

// A time field paired with a reason selector. Both stay editable at all times:
// a slot can carry a punched time AND a reason (e.g. a holiday the employee
// still logged in on). When both are set the DTR prints the reason for that
// cell and does not charge tardiness/undertime for it.
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
      />
      <Select
        items={REASON_ITEMS}
        value={reason}
        onValueChange={(v) => v && onReason(v)}
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

// One grid row: a date label, four time+reason slots, and an optional schedule
// pin for this date alone. The reason under each time is what makes a day with
// no punches meaningful — buildAttendanceRecord clears is_absent as soon as any
// reason is set, so a tagged rest day stops counting as an absence.
function RangeDateRow({
  dateStr,
  row,
  onCell,
  scheduleItems,
}: {
  dateStr: string;
  row: RangeRow;
  onCell: (d: string, key: keyof RangeRow, value: string) => void;
  scheduleItems: Record<string, string>;
}) {
  const labelDate = new Date(dateStr + "T00:00:00");
  const dow = labelDate.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const cell = cn("border-t px-2 py-1.5", isWeekend && "bg-muted/30");
  return (
    <>
      <div
        className={cn(
          "flex flex-col justify-center border-t px-3 py-1.5",
          isWeekend && "bg-muted/30",
        )}
      >
        <span className="font-medium">{format(labelDate, "EEE, MMM d")}</span>
      </div>
      {SLOTS.map((slot) => (
        <div key={slot.time} className={cell}>
          <div className="space-y-1">
            <Input
              type="time"
              aria-label={`${format(labelDate, "MMM d")} ${slot.label}`}
              value={row[slot.time]}
              onChange={(e) => onCell(dateStr, slot.time, e.target.value)}
              className="h-8"
            />
            <Select
              items={REASON_ITEMS}
              value={row[slot.reason]}
              onValueChange={(v) => v && onCell(dateStr, slot.reason, v)}
            >
              <SelectTrigger
                className="h-7 w-full text-xs"
                aria-label={`${format(labelDate, "MMM d")} ${slot.label} reason`}
              >
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
        </div>
      ))}
      <div className={cell}>
        <Select
          items={scheduleItems}
          value={row.scheduleId}
          onValueChange={(v) => v && onCell(dateStr, "scheduleId", v)}
        >
          <SelectTrigger
            className="h-8 w-full text-xs"
            aria-label={`${format(labelDate, "MMM d")} schedule`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(scheduleItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
  // Creating always uses the per-date grid; there is no single-date mode. The
  // end date defaults to the start date, so filing one day stays a two-click
  // job — that case used to be the single-date form.
  const [endDate, setEndDate] = useState<Date | undefined>(
    initialValues?.date ? new Date(initialValues.date + "T00:00:00") : new Date(),
  );
  // Off by default: with the single-date form gone, a lone Saturday is entered
  // by setting start = end, and skipping weekends would silently empty the grid
  // for exactly that case. Weekend duty is a real thing this form has to record.
  const [skipWeekends, setSkipWeekends] = useState(false);
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

  // Editing targets one existing attendance row, so it keeps the single-date
  // fields; creating is always a range.
  const useRange = !isEdit;

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
        .filter(({ row }) => rowHasContent(row))
        .map(({ d, row }) => ({
          date: d,
          time_in_am: row.amIn || null,
          time_out_am: row.amOut || null,
          time_in_pm: row.pmIn || null,
          time_out_pm: row.pmOut || null,
          reason_in_am: toReason(row.reasonAmIn),
          reason_out_am: toReason(row.reasonAmOut),
          reason_in_pm: toReason(row.reasonPmIn),
          reason_out_pm: toReason(row.reasonPmOut),
          // The row is the only source of a schedule when creating — there is
          // no range-level select any more. Left on "inherit" this is null, and
          // createAttendanceEntriesBulk falls back to the employee's assigned
          // schedule for that entry.
          schedule_id: toScheduleId(row.scheduleId),
        }));
      if (bulkEntries.length === 0) {
        toast.error("Enter a time or a reason on at least one date");
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
                <Command filter={commandSubstringFilter}>
                  <CommandInput placeholder="Search employee..." />
                  <CommandList>
                    <CommandEmpty>No employee found.</CommandEmpty>
                    <CommandGroup>
                      {employees.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={`${emp.last_name} ${emp.first_name}`}
                          keywords={employeeSearchKeywords(emp)}
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
                      // The end-date calendar blocks anything before the start,
                      // but the start can still be moved PAST the end, which
                      // would empty the grid with no visible cause. Carry the
                      // end along instead.
                      if (d && (!endDate || endDate < d)) setEndDate(d);
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

          {/* Schedule override — editing only. When creating, the schedule
              lives on each row of the grid below instead, so a range that
              spans a rotation can be entered in one pass. */}
          {!useRange && (
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
                Pin a specific shift for this day (for employees who change
                schedules daily or weekly). Late and undertime are computed
                against the chosen schedule.
              </p>
            </div>
          )}

          {/* Per-date grid (range mode) */}
          {useRange ? (
            <div className="space-y-2">
              <Label>Daily times</Label>
              <div className="overflow-x-auto rounded-md border">
                {/* min-w is the sum of the column minimums (7 + 4x6.5 + 8rem),
                    so the grid asks for no more space than it actually needs.
                    overflow-x-auto on the parent stays as the fallback for
                    genuinely narrow viewports — without it the PAGE would
                    scroll sideways instead, which is worse. */}
                <div className="grid min-w-[41rem] grid-cols-[minmax(7rem,1.1fr)_repeat(4,minmax(6.5rem,1fr))_minmax(8rem,1.2fr)] text-sm">
                  <div className="bg-muted/50 px-3 py-2 font-medium">Date</div>
                  {SLOTS.map((s) => (
                    <div
                      key={s.time}
                      className="bg-muted/50 px-3 py-2 font-medium"
                    >
                      {s.label}
                    </div>
                  ))}
                  <div className="bg-muted/50 px-3 py-2 font-medium">
                    Schedule
                  </div>
                  {rangeDates.map((d) => {
                    const row = getRow(d);
                    return (
                      <RangeDateRow
                        key={d}
                        dateStr={d}
                        row={row}
                        onCell={setCell}
                        scheduleItems={scheduleItems}
                      />
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the punch times for each day. The reason under a time
                prints in that slot on the DTR and stops the day counting as an
                absence — use it for days with no punches (SATURDAY, LEAVE,
                OFF). Set Schedule on a row only for a day that ran on a
                different shift; left alone, each day uses the employee&apos;s
                assigned schedule. Dates left entirely blank are skipped
                (existing logs are not overwritten).
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
                  Pick a reason (TRAVEL, FIELD WORK, OFFICIAL BUSINESS, HOLIDAY,
                  OFF) for a slot — with or without a time. The DTR prints the
                  reason in that cell instead of the time and does not charge
                  tardiness/undertime for it.
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

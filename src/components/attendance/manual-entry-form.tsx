"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { createAttendanceEntry } from "@/lib/actions/attendance-actions";
import {
  NO_TIME_REASONS,
  NO_TIME_REASON_LABELS,
  type NoTimeReason,
} from "@/lib/constants";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

interface ManualEntryInitialValues {
  employeeId: string;
  date: string; // yyyy-MM-dd
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

interface ManualEntryFormProps {
  employees: EmployeeWithRelations[];
  initialValues?: ManualEntryInitialValues;
}

export function ManualEntryForm({ employees, initialValues }: ManualEntryFormProps) {
  const router = useRouter();
  const isEdit = !!initialValues;
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>(initialValues?.employeeId ?? "");
  const [date, setDate] = useState<Date | undefined>(
    initialValues?.date ? new Date(initialValues.date + "T00:00:00") : new Date(),
  );
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !date) {
      toast.error("Please select an employee and date");
      return;
    }

    setLoading(true);
    try {
      await createAttendanceEntry({
        employee_id: employeeId,
        date: format(date, "yyyy-MM-dd"),
        time_in_am: timeInAm || null,
        time_out_am: timeOutAm || null,
        time_in_pm: timeInPm || null,
        time_out_pm: timeOutPm || null,
        remarks: remarks || undefined,
        reason_in_am: toReason(reasonInAm),
        reason_out_am: toReason(reasonOutAm),
        reason_in_pm: toReason(reasonInPm),
        reason_out_pm: toReason(reasonOutPm),
      });

      toast.success(isEdit ? "Attendance entry updated" : "Attendance entry saved");
      router.push("/attendance");
    } catch (err) {
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

          {/* Date */}
          <div className="space-y-2">
            <Label>Date</Label>
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
              {isEdit ? "Update Entry" : "Save Entry"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

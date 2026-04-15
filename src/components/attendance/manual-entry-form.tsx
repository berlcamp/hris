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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { createAttendanceEntry } from "@/lib/actions/attendance-actions";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

interface ManualEntryFormProps {
  employees: EmployeeWithRelations[];
}

export function ManualEntryForm({ employees }: ManualEntryFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [timeInAm, setTimeInAm] = useState("");
  const [timeOutAm, setTimeOutAm] = useState("");
  const [timeInPm, setTimeInPm] = useState("");
  const [timeOutPm, setTimeOutPm] = useState("");
  const [remarks, setRemarks] = useState("");
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
      });

      toast.success("Attendance entry saved");
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
                render={<Button variant="outline" role="combobox" className="w-full justify-between font-normal" />}
              >
                {selectedEmployee
                  ? `${selectedEmployee.last_name}, ${selectedEmployee.first_name} (${selectedEmployee.employee_no})`
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
                            <p className="text-sm font-medium">
                              {emp.last_name}, {emp.first_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {emp.employee_no} •{" "}
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
                render={
                  <Button
                    variant="outline"
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

          {/* Time Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Morning (AM)</h4>
              <div className="space-y-2">
                <Label htmlFor="time_in_am" className="text-xs">
                  Time In
                </Label>
                <Input
                  id="time_in_am"
                  type="time"
                  value={timeInAm}
                  onChange={(e) => setTimeInAm(e.target.value)}
                  placeholder="08:00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time_out_am" className="text-xs">
                  Time Out
                </Label>
                <Input
                  id="time_out_am"
                  type="time"
                  value={timeOutAm}
                  onChange={(e) => setTimeOutAm(e.target.value)}
                  placeholder="12:00"
                />
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Afternoon (PM)</h4>
              <div className="space-y-2">
                <Label htmlFor="time_in_pm" className="text-xs">
                  Time In
                </Label>
                <Input
                  id="time_in_pm"
                  type="time"
                  value={timeInPm}
                  onChange={(e) => setTimeInPm(e.target.value)}
                  placeholder="13:00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time_out_pm" className="text-xs">
                  Time Out
                </Label>
                <Input
                  id="time_out_pm"
                  type="time"
                  value={timeOutPm}
                  onChange={(e) => setTimeOutPm(e.target.value)}
                  placeholder="17:00"
                />
              </div>
            </div>
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
              Save Entry
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

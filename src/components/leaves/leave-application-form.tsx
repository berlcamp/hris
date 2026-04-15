"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, isWeekend, eachDayOfInterval, addDays } from "date-fns";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { createLeaveApplication } from "@/lib/actions/leave-actions";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";
import type { LeaveTypeRow, LeaveCreditRow } from "@/lib/actions/leave-actions";

interface LeaveApplicationFormProps {
  employees: EmployeeWithRelations[];
  leaveTypes: LeaveTypeRow[];
  currentEmployeeId: string | null;
  isEmployee: boolean;
}

const VACATION_CODES = ["VL", "SPL"];
const SICK_CODES = ["SL"];

export function LeaveApplicationForm({
  employees,
  leaveTypes,
  currentEmployeeId,
  isEmployee,
}: LeaveApplicationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [empOpen, setEmpOpen] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(currentEmployeeId);
  const selectedEmp = useMemo(
    () => employees.find((e) => e.id === selectedEmpId) ?? null,
    [employees, selectedEmpId]
  );

  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState<string>("");
  const selectedLeaveType = useMemo(
    () => leaveTypes.find((lt) => lt.id === selectedLeaveTypeId) ?? null,
    [leaveTypes, selectedLeaveTypeId]
  );

  // Selected dates (multi-select)
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [selectionMode, setSelectionMode] = useState<"pick" | "range">("pick");
  const [rangeStart, setRangeStart] = useState<Date | null>(null);

  // CSC Form 6 fields
  const [reason, setReason] = useState("");
  const [detailsOfLeave, setDetailsOfLeave] = useState("");
  const [commutationRequested, setCommutationRequested] = useState(false);

  // Leave credits
  const [credits, setCredits] = useState<LeaveCreditRow[]>([]);

  useEffect(() => {
    if (!selectedEmpId) {
      setCredits([]);
      return;
    }
    const fetchCredits = async () => {
      const year = new Date().getFullYear();
      const { getEmployeeLeaveCredits } = await import("@/lib/actions/leave-actions");
      const data = await getEmployeeLeaveCredits(selectedEmpId, year);
      setCredits(data);
    };
    fetchCredits();
  }, [selectedEmpId]);

  // Sorted dates and derived values
  const sortedDates = useMemo(
    () => [...selectedDates].sort((a, b) => a.getTime() - b.getTime()),
    [selectedDates]
  );
  const workingDays = selectedDates.length;
  const startDate = sortedDates.length > 0 ? format(sortedDates[0], "yyyy-MM-dd") : "";
  const endDate = sortedDates.length > 0 ? format(sortedDates[sortedDates.length - 1], "yyyy-MM-dd") : "";
  const leaveDateStrings = sortedDates.map((d) => format(d, "yyyy-MM-dd"));

  const selectedCredit = useMemo(() => {
    if (!selectedLeaveTypeId) return null;
    return credits.find((c) => c.leave_type_id === selectedLeaveTypeId) ?? null;
  }, [credits, selectedLeaveTypeId]);

  const availableBalance = selectedCredit ? Number(selectedCredit.balance) : 0;
  const insufficientCredits = !!(selectedLeaveTypeId && workingDays > 0 && workingDays > availableBalance);

  useEffect(() => {
    setDetailsOfLeave("");
  }, [selectedLeaveTypeId]);

  const removeDate = (dateToRemove: Date) => {
    setSelectedDates((prev) => prev.filter((d) => d.getTime() !== dateToRemove.getTime()));
  };

  // Handle range mode: first click = start, second click = end, select all weekdays in between
  const handleRangeClick = useCallback((day: Date) => {
    if (!rangeStart) {
      setRangeStart(day);
      return;
    }
    const [from, to] = rangeStart < day ? [rangeStart, day] : [day, rangeStart];
    const allDays = eachDayOfInterval({ start: from, end: to });
    const weekdays = allDays.filter((d) => !isWeekend(d));
    // Merge with existing, dedup by time
    setSelectedDates((prev) => {
      const existing = new Set(prev.map((d) => d.getTime()));
      const merged = [...prev];
      for (const d of weekdays) {
        if (!existing.has(d.getTime())) merged.push(d);
      }
      return merged;
    });
    setRangeStart(null);
  }, [rangeStart]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId || !selectedLeaveTypeId || workingDays <= 0) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    const result = await createLeaveApplication({
      employee_id: selectedEmpId,
      leave_type_id: selectedLeaveTypeId,
      start_date: startDate,
      end_date: endDate,
      days_applied: workingDays,
      reason: reason || null,
      details_of_leave: detailsOfLeave || null,
      commutation_requested: commutationRequested,
      leave_dates: leaveDateStrings,
    });

    if ("error" in result && result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success("Leave application submitted successfully.");
    router.push(`/leaves/${result.data?.id}`);
  };

  const code = selectedLeaveType?.code ?? "";

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="p-0">
          {/* Form Header */}
          <div className="border-b bg-muted/30 px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground">Civil Service Form No. 6 (Revised 2020)</p>
            <p className="text-xs text-muted-foreground mt-0.5">Republic of the Philippines</p>
            <h2 className="text-lg font-bold tracking-wide mt-1">APPLICATION FOR LEAVE</h2>
          </div>

          {/* Section 1-5: Employee Info */}
          <div className="border-b">
            <div className="grid grid-cols-2 divide-x">
              <div className="px-4 py-3 border-b">
                <Label className="text-xs text-muted-foreground">1. OFFICE/DEPARTMENT</Label>
                <p className="text-sm font-medium mt-0.5">
                  {selectedEmp?.departments?.name ?? "—"}
                </p>
              </div>
              <div className="px-4 py-3 border-b">
                <Label className="text-xs text-muted-foreground">2. NAME (Last, First, Middle)</Label>
                {isEmployee ? (
                  <p className="text-sm font-medium mt-0.5">
                    {selectedEmp
                      ? `${selectedEmp.last_name}, ${selectedEmp.first_name}${selectedEmp.middle_name ? ` ${selectedEmp.middle_name}` : ""}`
                      : "—"}
                  </p>
                ) : (
                  <Popover open={empOpen} onOpenChange={setEmpOpen}>
                    <PopoverTrigger
                      render={<Button variant="outline" role="combobox" className="w-full justify-between h-8 mt-0.5 font-normal" />}
                    >
                      {selectedEmp
                        ? `${selectedEmp.last_name}, ${selectedEmp.first_name}`
                        : "Select employee..."}
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search by name or employee no..." />
                        <CommandList>
                          <CommandEmpty>No employees found.</CommandEmpty>
                          <CommandGroup>
                            {employees.map((emp) => (
                              <CommandItem
                                key={emp.id}
                                value={`${emp.last_name} ${emp.first_name} ${emp.employee_no}`}
                                onSelect={() => {
                                  setSelectedEmpId(emp.id);
                                  setEmpOpen(false);
                                  setSelectedLeaveTypeId("");
                                  setSelectedDates([]);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedEmpId === emp.id ? "opacity-100" : "opacity-0")} />
                                <div>
                                  <p className="font-medium">{emp.last_name}, {emp.first_name}</p>
                                  <p className="text-xs text-muted-foreground">{emp.employee_no}</p>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x">
              <div className="px-4 py-3">
                <Label className="text-xs text-muted-foreground">3. DATE OF FILING</Label>
                <p className="text-sm font-medium mt-0.5">{format(new Date(), "MMMM d, yyyy")}</p>
              </div>
              <div className="px-4 py-3">
                <Label className="text-xs text-muted-foreground">4. POSITION</Label>
                <p className="text-sm font-medium mt-0.5">{selectedEmp?.positions?.title ?? "—"}</p>
              </div>
              <div className="px-4 py-3">
                <Label className="text-xs text-muted-foreground">5. SALARY</Label>
                <p className="text-sm font-medium mt-0.5">
                  {selectedEmp ? `SG-${selectedEmp.salary_grade}` : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Section 6: Details of Application */}
          {selectedEmpId && (
            <div className="border-b">
              <div className="bg-muted/30 px-4 py-2 border-b">
                <p className="text-xs font-semibold tracking-wide">6. DETAILS OF APPLICATION</p>
              </div>

              {/* 6.A Type of Leave */}
              <div className="px-4 py-3 border-b">
                <Label className="text-xs text-muted-foreground mb-2 block">6.A TYPE OF LEAVE TO BE AVAILED OF</Label>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                  {leaveTypes.map((lt) => {
                    const credit = credits.find((c) => c.leave_type_id === lt.id);
                    const bal = credit ? Number(credit.balance) : 0;
                    return (
                      <label
                        key={lt.id}
                        className={cn(
                          "flex items-center gap-2 cursor-pointer rounded-md px-2 py-1 -mx-2 text-sm transition-colors",
                          selectedLeaveTypeId === lt.id
                            ? "bg-primary/10 font-medium"
                            : "hover:bg-muted"
                        )}
                      >
                        <input
                          type="radio"
                          name="leave_type"
                          value={lt.id}
                          checked={selectedLeaveTypeId === lt.id}
                          onChange={() => setSelectedLeaveTypeId(lt.id)}
                          className="accent-primary"
                        />
                        <span className="flex-1">{lt.name}</span>
                        {credit && (
                          <span className="text-xs text-muted-foreground">{bal}d</span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {selectedCredit && (
                  <p className="text-xs text-muted-foreground mt-2 px-2">
                    Credit balance: <span className="font-semibold">{availableBalance}</span> day(s)
                    (Total: {Number(selectedCredit.total_credits)}, Used: {Number(selectedCredit.used_credits)})
                  </p>
                )}
              </div>

              {/* 6.B Details of Leave */}
              <div className="px-4 py-3 border-b">
                <Label className="text-xs text-muted-foreground mb-2 block">6.B DETAILS OF LEAVE</Label>
                {VACATION_CODES.includes(code) && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">In case of Vacation/Special Privilege Leave:</p>
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="leave_detail" value="Within the Philippines" checked={detailsOfLeave === "Within the Philippines"} onChange={() => setDetailsOfLeave("Within the Philippines")} className="accent-primary" />
                        Within the Philippines
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="leave_detail" value="Abroad" checked={detailsOfLeave.startsWith("Abroad")} onChange={() => setDetailsOfLeave("Abroad")} className="accent-primary" />
                        Abroad (Specify)
                      </label>
                      {detailsOfLeave.startsWith("Abroad") && (
                        <Input
                          placeholder="Specify country/destination"
                          value={detailsOfLeave === "Abroad" ? "" : detailsOfLeave.replace("Abroad: ", "")}
                          onChange={(e) => setDetailsOfLeave(e.target.value ? `Abroad: ${e.target.value}` : "Abroad")}
                          className="ml-6 w-auto"
                        />
                      )}
                    </div>
                  </div>
                )}
                {SICK_CODES.includes(code) && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">In case of Sick Leave:</p>
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="leave_detail" value="In Hospital" checked={detailsOfLeave.startsWith("In Hospital")} onChange={() => setDetailsOfLeave("In Hospital")} className="accent-primary" />
                        In Hospital (Specify Illness)
                      </label>
                      {detailsOfLeave.startsWith("In Hospital") && (
                        <Input
                          placeholder="Specify illness"
                          value={detailsOfLeave === "In Hospital" ? "" : detailsOfLeave.replace("In Hospital: ", "")}
                          onChange={(e) => setDetailsOfLeave(e.target.value ? `In Hospital: ${e.target.value}` : "In Hospital")}
                          className="ml-6 w-auto"
                        />
                      )}
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="leave_detail" value="Out Patient" checked={detailsOfLeave.startsWith("Out Patient")} onChange={() => setDetailsOfLeave("Out Patient")} className="accent-primary" />
                        Out Patient (Specify Illness)
                      </label>
                      {detailsOfLeave.startsWith("Out Patient") && (
                        <Input
                          placeholder="Specify illness"
                          value={detailsOfLeave === "Out Patient" ? "" : detailsOfLeave.replace("Out Patient: ", "")}
                          onChange={(e) => setDetailsOfLeave(e.target.value ? `Out Patient: ${e.target.value}` : "Out Patient")}
                          className="ml-6 w-auto"
                        />
                      )}
                    </div>
                  </div>
                )}
                {!VACATION_CODES.includes(code) && !SICK_CODES.includes(code) && code && (
                  <Input
                    placeholder="Specify details..."
                    value={detailsOfLeave}
                    onChange={(e) => setDetailsOfLeave(e.target.value)}
                  />
                )}
                {!code && (
                  <p className="text-xs text-muted-foreground italic">Select a leave type first</p>
                )}
              </div>

              {/* 6.C Number of Working Days & Inclusive Dates */}
              <div className="px-4 py-3 border-b">
                <Label className="text-xs text-muted-foreground mb-2 block">6.C NUMBER OF WORKING DAYS APPLIED FOR &amp; INCLUSIVE DATES</Label>

                {/* Mode toggle */}
                <div className="flex items-center gap-1 mb-3">
                  <Button
                    type="button"
                    variant={selectionMode === "pick" ? "default" : "outline"}
                    size="xs"
                    onClick={() => { setSelectionMode("pick"); setRangeStart(null); }}
                  >
                    Pick dates
                  </Button>
                  <Button
                    type="button"
                    variant={selectionMode === "range" ? "default" : "outline"}
                    size="xs"
                    onClick={() => { setSelectionMode("range"); setRangeStart(null); }}
                  >
                    Select range
                  </Button>
                  <span className="text-xs text-muted-foreground ml-2">
                    {selectionMode === "pick"
                      ? "Click dates to toggle individually"
                      : rangeStart
                        ? `Start: ${format(rangeStart, "MMM d")} — now click the end date`
                        : "Click the start date of the range"}
                  </span>
                </div>

                <div className="flex gap-6">
                  {selectionMode === "pick" ? (
                    <Calendar
                      mode="multiple"
                      selected={selectedDates}
                      onSelect={(dates) => setSelectedDates(dates ?? [])}
                      captionLayout="dropdown"
                      fromYear={new Date().getFullYear() - 1}
                      toYear={new Date().getFullYear() + 1}
                      disabled={(date) => isWeekend(date)}
                      className="rounded-md border"
                    />
                  ) : (
                    <Calendar
                      mode="single"
                      selected={rangeStart ?? undefined}
                      onSelect={(day) => { if (day) handleRangeClick(day); }}
                      captionLayout="dropdown"
                      fromYear={new Date().getFullYear() - 1}
                      toYear={new Date().getFullYear() + 1}
                      disabled={(date) => isWeekend(date)}
                      modifiers={{ selected: selectedDates, rangeStart: rangeStart ? [rangeStart] : [] }}
                      modifiersClassNames={{ selected: "bg-primary text-primary-foreground", rangeStart: "ring-2 ring-primary" }}
                      className="rounded-md border"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium">Selected:</span>
                      <Badge variant={insufficientCredits ? "destructive" : "secondary"}>
                        {workingDays} day(s)
                      </Badge>
                      {insufficientCredits && (
                        <span className="text-xs text-destructive">Exceeds balance</span>
                      )}
                    </div>
                    {sortedDates.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-[220px] overflow-y-auto">
                        {sortedDates.length <= 30 ? (
                          sortedDates.map((d) => (
                            <Badge
                              key={d.toISOString()}
                              variant="outline"
                              className="gap-1 pr-1"
                            >
                              {format(d, "MMM d")}
                              <button
                                type="button"
                                onClick={() => removeDate(d)}
                                className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))
                        ) : (
                          <p className="text-sm">
                            {format(sortedDates[0], "MMM d, yyyy")} to{" "}
                            {format(sortedDates[sortedDates.length - 1], "MMM d, yyyy")}{" "}
                            <span className="text-muted-foreground">({workingDays} weekdays selected)</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No dates selected</p>
                    )}
                    {sortedDates.length > 0 && (
                      <div className="mt-3 text-xs text-muted-foreground">
                        <p>From: <span className="font-medium">{format(sortedDates[0], "MMMM d, yyyy")}</span></p>
                        <p>To: <span className="font-medium">{format(sortedDates[sortedDates.length - 1], "MMMM d, yyyy")}</span></p>
                      </div>
                    )}
                    {sortedDates.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-xs"
                        onClick={() => { setSelectedDates([]); setRangeStart(null); }}
                      >
                        Clear all dates
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* 6.D Commutation */}
              <div className="px-4 py-3 border-b">
                <Label className="text-xs text-muted-foreground mb-2 block">6.D COMMUTATION</Label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="commutation" checked={!commutationRequested} onChange={() => setCommutationRequested(false)} className="accent-primary" />
                    Not Requested
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="commutation" checked={commutationRequested} onChange={() => setCommutationRequested(true)} className="accent-primary" />
                    Requested
                  </label>
                </div>
              </div>

              {/* Reason */}
              <div className="px-4 py-3">
                <Label className="text-xs text-muted-foreground mb-2 block">REASON / REMARKS (Optional)</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Additional remarks..."
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-6 py-4 flex gap-3">
            <Button
              type="submit"
              disabled={loading || !selectedEmpId || !selectedLeaveTypeId || workingDays <= 0}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Application
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/leaves")}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

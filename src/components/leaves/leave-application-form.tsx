"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, differenceInBusinessDays, addDays } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function LeaveApplicationForm({
  employees,
  leaveTypes,
  currentEmployeeId,
  isEmployee,
}: LeaveApplicationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Employee selection
  const [empOpen, setEmpOpen] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(currentEmployeeId);
  const selectedEmp = useMemo(
    () => employees.find((e) => e.id === selectedEmpId) ?? null,
    [employees, selectedEmpId]
  );

  // Leave type selection
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState<string>("");

  // Date range
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  // Other fields
  const [reason, setReason] = useState("");

  // Leave credits for selected employee
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

  // Calculate working days
  const workingDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return 0;
    // differenceInBusinessDays doesn't include start day, so add 1
    return differenceInBusinessDays(addDays(end, 1), start);
  }, [startDate, endDate]);

  // Get available balance for selected leave type
  const selectedCredit = useMemo(() => {
    if (!selectedLeaveTypeId) return null;
    return credits.find((c) => c.leave_type_id === selectedLeaveTypeId) ?? null;
  }, [credits, selectedLeaveTypeId]);

  const availableBalance = selectedCredit ? Number(selectedCredit.balance) : 0;
  const insufficientCredits = selectedLeaveTypeId && workingDays > 0 && workingDays > availableBalance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId || !selectedLeaveTypeId || !startDate || !endDate) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (workingDays <= 0) {
      toast.error("Invalid date range.");
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
    });

    if ("error" in result && result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success("Leave application submitted successfully.");
    router.push(`/leaves/${result.data?.id}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Employee Selection */}
      <Card>
        <CardHeader><CardTitle>Employee</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {isEmployee ? (
            <div className="text-sm">
              <p className="font-medium">
                {selectedEmp
                  ? `${selectedEmp.last_name}, ${selectedEmp.first_name} (${selectedEmp.employee_no})`
                  : "Your employee record was not found."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Popover open={empOpen} onOpenChange={setEmpOpen}>
                <PopoverTrigger
                  render={<Button variant="outline" role="combobox" className="w-full justify-between" />}
                >
                  {selectedEmp
                    ? `${selectedEmp.last_name}, ${selectedEmp.first_name} (${selectedEmp.employee_no})`
                    : "Select an employee..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leave Details */}
      {selectedEmpId && (
        <Card>
          <CardHeader><CardTitle>Leave Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Leave Type *</Label>
              <Select value={selectedLeaveTypeId} onValueChange={(v) => setSelectedLeaveTypeId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt) => {
                    const credit = credits.find((c) => c.leave_type_id === lt.id);
                    const bal = credit ? Number(credit.balance) : 0;
                    const label = `${lt.name} (${lt.code})${credit ? ` — ${bal} day(s) available` : ""}`;
                    return (
                      <SelectItem key={lt.id} value={lt.id} label={label}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedCredit && (
                <p className="text-xs text-muted-foreground">
                  Balance: <span className="font-semibold">{availableBalance}</span> day(s)
                  (Total: {Number(selectedCredit.total_credits)}, Used: {Number(selectedCredit.used_credits)})
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Popover open={startOpen} onOpenChange={setStartOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                      />
                    }
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(new Date(startDate), "MMMM d, yyyy") : "Select date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate ? new Date(startDate) : undefined}
                      onSelect={(d) => {
                        setStartDate(d ? format(d, "yyyy-MM-dd") : "");
                        setStartOpen(false);
                      }}
                      captionLayout="dropdown"
                      fromYear={new Date().getFullYear() - 1}
                      toYear={new Date().getFullYear() + 1}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>End Date *</Label>
                <Popover open={endOpen} onOpenChange={setEndOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                      />
                    }
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(new Date(endDate), "MMMM d, yyyy") : "Select date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate ? new Date(endDate) : undefined}
                      onSelect={(d) => {
                        setEndDate(d ? format(d, "yyyy-MM-dd") : "");
                        setEndOpen(false);
                      }}
                      captionLayout="dropdown"
                      fromYear={new Date().getFullYear() - 1}
                      toYear={new Date().getFullYear() + 1}
                      disabled={(date) => startDate ? date < new Date(startDate) : false}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {workingDays > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Working days:</span>
                <Badge variant={insufficientCredits ? "destructive" : "secondary"}>
                  {workingDays} day(s)
                </Badge>
                {insufficientCredits && (
                  <span className="text-xs text-destructive">Exceeds available balance</span>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Reason / Details</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional reason for leave..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={loading || !selectedEmpId || !selectedLeaveTypeId || !startDate || !endDate || workingDays <= 0}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Application
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/leaves")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

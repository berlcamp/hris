"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { createCtoApplication, getCtoBalance } from "@/lib/actions/cto-actions";
import { expandWorkingDays } from "@/lib/cto-helpers";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";
import { getEffectivePosition } from "@/lib/employee-position";

interface CtoApplicationFormProps {
  employees: EmployeeWithRelations[];
  currentEmployeeId: string | null;
  isEmployee: boolean;
  /** YYYY-MM-DD dates of full holidays (excluded from working days). */
  fullHolidayDates: string[];
}

export function CtoApplicationForm({
  employees,
  currentEmployeeId,
  isEmployee,
  fullHolidayDates,
}: CtoApplicationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [empOpen, setEmpOpen] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(currentEmployeeId);
  const selectedEmp = useMemo(
    () => employees.find((e) => e.id === selectedEmpId) ?? null,
    [employees, selectedEmpId]
  );

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfLastDay, setHalfLastDay] = useState(false);
  const [reason, setReason] = useState("");

  // Available COC balance (as of today) for the selected employee.
  const [available, setAvailable] = useState<number | null>(null);
  const [expiringSoon, setExpiringSoon] = useState<number>(0);

  useEffect(() => {
    // selectedEmpId only ever moves from null to a real id, so no sync reset
    // is needed here; the async fetch below updates the balance display.
    if (!selectedEmpId) return;
    let stale = false;
    getCtoBalance(selectedEmpId).then((result) => {
      if (stale) return;
      if ("error" in result) {
        setAvailable(null);
        setExpiringSoon(0);
      } else {
        setAvailable(result.available);
        setExpiringSoon(result.expiringSoon);
      }
    });
    return () => {
      stale = true;
    };
  }, [selectedEmpId]);

  const holidaySet = useMemo(() => new Set(fullHolidayDates), [fullHolidayDates]);
  const ctoDates = useMemo(
    () => expandWorkingDays(startDate, endDate, holidaySet),
    [startDate, endDate, holidaySet]
  );

  const tooManyDays = ctoDates.length > 5;
  const hoursApplied =
    ctoDates.length > 0 ? ctoDates.length * 8 - (halfLastDay ? 4 : 0) : 0;
  const insufficient =
    available !== null && hoursApplied > 0 && hoursApplied > available;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId || ctoDates.length === 0 || tooManyDays) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    const result = await createCtoApplication({
      employee_id: selectedEmpId,
      start_date: startDate,
      end_date: endDate,
      cto_dates: ctoDates,
      hours_applied: hoursApplied,
      reason: reason || null,
    });

    if ("error" in result && result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success("CTO application submitted successfully.");
    router.push(`/cto/${result.data?.id}`);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="p-0">
          {/* Form Header */}
          <div className="border-b bg-muted/30 px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              CSC-DBM Joint Circular No. 2, s. 2004
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Republic of the Philippines</p>
            <h2 className="text-lg font-bold tracking-wide mt-1">
              APPLICATION FOR COMPENSATORY TIME-OFF
            </h2>
          </div>

          {/* Employee Info */}
          <div className="border-b">
            <div className="grid grid-cols-2 divide-x">
              <div className="px-4 py-3 border-b">
                <Label className="text-xs text-muted-foreground">OFFICE/DEPARTMENT</Label>
                <p className="text-sm font-medium mt-0.5">
                  {selectedEmp?.departments?.name ?? "—"}
                </p>
              </div>
              <div className="px-4 py-3 border-b">
                <Label className="text-xs text-muted-foreground">NAME (Last, First, Middle)</Label>
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
                        <CommandInput placeholder="Search by name..." />
                        <CommandList>
                          <CommandEmpty>No employees found.</CommandEmpty>
                          <CommandGroup>
                            {employees.map((emp) => (
                              <CommandItem
                                key={emp.id}
                                value={`${emp.last_name} ${emp.first_name}`}
                                onSelect={() => {
                                  setSelectedEmpId(emp.id);
                                  setEmpOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedEmpId === emp.id ? "opacity-100" : "opacity-0")} />
                                <div>
                                  <p className="font-medium">{emp.last_name}, {emp.first_name}</p>
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
            <div className="grid grid-cols-2 divide-x">
              <div className="px-4 py-3">
                <Label className="text-xs text-muted-foreground">DATE OF FILING</Label>
                <p className="text-sm font-medium mt-0.5">{format(new Date(), "MMMM d, yyyy")}</p>
              </div>
              <div className="px-4 py-3">
                <Label className="text-xs text-muted-foreground">POSITION</Label>
                <p className="text-sm font-medium mt-0.5">
                  {(selectedEmp && getEffectivePosition(selectedEmp)) ?? "—"}
                </p>
              </div>
            </div>
          </div>

          {selectedEmpId && (
            <div className="border-b">
              {/* Balance */}
              <div className="px-4 py-3 border-b">
                <Label className="text-xs text-muted-foreground mb-1 block">
                  AVAILABLE COC BALANCE
                </Label>
                {available === null ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{available} hour(s)</Badge>
                    <span className="text-xs text-muted-foreground">
                      = {available / 8} day(s)
                    </span>
                    {expiringSoon > 0 && (
                      <span className="text-xs text-amber-700 dark:text-amber-500">
                        {expiringSoon}h expiring within 30 days
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Dates */}
              <div className="px-4 py-3 border-b">
                <Label className="text-xs text-muted-foreground mb-2 block">
                  INCLUSIVE DATES (max 5 consecutive working days)
                </Label>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cto-start" className="text-xs">From</Label>
                    <Input
                      id="cto-start"
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
                      }}
                      className="w-auto"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cto-end" className="text-xs">To</Label>
                    <Input
                      id="cto-end"
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-auto"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm pb-2">
                    <input
                      type="checkbox"
                      checked={halfLastDay}
                      onChange={(e) => setHalfLastDay(e.target.checked)}
                      className="accent-primary"
                      disabled={ctoDates.length === 0}
                    />
                    Last day is a half day (4 hours)
                  </label>
                </div>

                {ctoDates.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {ctoDates.map((d, i) => (
                        <Badge key={d} variant="outline">
                          {format(new Date(d + "T00:00:00"), "EEE, MMM d")}
                          {halfLastDay && i === ctoDates.length - 1 && " (½ day)"}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">Hours to avail:</span>
                      <Badge variant="secondary">{hoursApplied} hour(s)</Badge>
                      <span className="text-xs text-muted-foreground">
                        Weekends and holidays are excluded automatically.
                      </span>
                    </div>
                  </div>
                )}
                {startDate && endDate && ctoDates.length === 0 && (
                  <p className="mt-2 text-xs text-destructive">
                    The selected range contains no working days.
                  </p>
                )}
                {tooManyDays && (
                  <p className="mt-2 text-xs text-destructive">
                    CTO may be availed for at most 5 consecutive working days per
                    application (CSC-DBM JC No. 2, s. 2004). Please shorten the range.
                  </p>
                )}
                {insufficient && (
                  <p className="mt-2 text-xs text-destructive">
                    Insufficient COC balance: this application needs {hoursApplied}h
                    but only {available}h is available.
                  </p>
                )}
              </div>

              {/* Reason */}
              <div className="px-4 py-3">
                <Label className="text-xs text-muted-foreground mb-2 block">
                  REASON / REMARKS (Optional)
                </Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Additional remarks..."
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* CSC conditions */}
          <div className="border-b bg-muted/30 px-6 py-3">
            <p className="text-xs text-muted-foreground">
              Per CSC-DBM Joint Circular No. 2, s. 2004: CTO is availed in 4-hour
              blocks (half day) or 8-hour blocks (full day). Compensatory Overtime
              Credits are non-convertible to cash, cannot be used to offset
              tardiness or undertime, and expire one year from the date the
              overtime was rendered.
            </p>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 flex gap-3">
            <Button
              type="submit"
              disabled={
                loading ||
                !selectedEmpId ||
                ctoDates.length === 0 ||
                tooManyDays ||
                insufficient
              }
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Application
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/cto")}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

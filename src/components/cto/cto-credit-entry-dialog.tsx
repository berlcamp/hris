"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { createCtoCredit, previewCtoCreditClamp } from "@/lib/actions/cto-actions";
import {
  suggestDayType,
  CTO_DAY_TYPE_LABELS,
  CTO_MULTIPLIERS,
  type CtoDayType,
} from "@/lib/cto-helpers";

interface CtoCreditEntryDialogProps {
  employees: { id: string; first_name: string; last_name: string }[];
  /** YYYY-MM-DD dates of holidays (any type) for day-type auto-suggestion. */
  holidayDates: string[];
  /** Pre-select this employee and hide the picker (per-employee ledger page). */
  fixedEmployeeId?: string;
  fixedEmployeeName?: string;
}

interface ClampPreview {
  rawEarned: number;
  storedEarned: number;
  clampedBy: ("monthly_cap" | "balance_cap")[];
  monthEarnedSoFar: number;
  available: number;
}

export function CtoCreditEntryDialog({
  employees,
  holidayDates,
  fixedEmployeeId,
  fixedEmployeeName,
}: CtoCreditEntryDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [empOpen, setEmpOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(fixedEmployeeId ?? "");
  const [otDate, setOtDate] = useState("");
  const [dayType, setDayType] = useState<CtoDayType>("regular");
  const [hours, setHours] = useState("");
  const [officeOrderNo, setOfficeOrderNo] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<ClampPreview | null>(null);

  const holidaySet = useMemo(() => new Set(holidayDates), [holidayDates]);
  const selectedEmp = employees.find((e) => e.id === employeeId) ?? null;

  // Auto-suggest the day type whenever the OT date changes; HR can still
  // override it afterwards via the select.
  const handleOtDateChange = (value: string) => {
    setOtDate(value);
    if (value) setDayType(suggestDayType(value, holidaySet.has(value)));
  };

  // Live clamp preview from the server (40h/month + 120h balance caps).
  // All setState happens inside the debounce timer, never synchronously.
  useEffect(() => {
    const parsed = Number(hours);
    const valid =
      !!employeeId && !!otDate && Number.isFinite(parsed) && parsed > 0;
    let stale = false;
    const timer = setTimeout(async () => {
      if (!valid) {
        if (!stale) setPreview(null);
        return;
      }
      const result = await previewCtoCreditClamp({
        employee_id: employeeId,
        ot_date: otDate,
        day_type: dayType,
        hours_worked: parsed,
      });
      if (!stale && !("error" in result)) setPreview(result);
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [employeeId, otDate, dayType, hours]);

  const reset = () => {
    if (!fixedEmployeeId) setEmployeeId("");
    setOtDate("");
    setDayType("regular");
    setHours("");
    setOfficeOrderNo("");
    setNotes("");
    setPreview(null);
  };

  const handleSubmit = async () => {
    const parsed = Number(hours);
    if (!employeeId || !otDate || !Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setLoading(true);
    const result = await createCtoCredit({
      employee_id: employeeId,
      ot_date: otDate,
      day_type: dayType,
      hours_worked: parsed,
      office_order_no: officeOrderNo || null,
      notes: notes || null,
    });
    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      const r = result as { storedEarned?: number; rawEarned?: number };
      if (r.storedEarned !== undefined && r.rawEarned !== undefined && r.storedEarned < r.rawEarned) {
        toast.warning(
          `COC entry saved, clamped to ${r.storedEarned}h (of ${r.rawEarned}h) by CSC caps.`
        );
      } else {
        toast.success("COC entry recorded successfully.");
      }
      setOpen(false);
      reset();
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4" />
        Add COC Entry
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record COC Earned</DialogTitle>
          <DialogDescription>
            {fixedEmployeeName
              ? `Record authorized overtime rendered by ${fixedEmployeeName}.`
              : "Record authorized overtime rendered by an employee."}{" "}
            COC = hours × 1.0 (regular workday) or × 1.5 (rest day/holiday), capped
            at 40h earned per month and a 120h total balance. Credits expire one
            year from the overtime date.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!fixedEmployeeId && (
            <div className="space-y-2">
              <Label>Employee</Label>
              <Popover open={empOpen} onOpenChange={setEmpOpen}>
                <PopoverTrigger
                  render={<Button variant="outline" role="combobox" className="w-full justify-between font-normal" />}
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
                              setEmployeeId(emp.id);
                              setEmpOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", employeeId === emp.id ? "opacity-100" : "opacity-0")} />
                            {emp.last_name}, {emp.first_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Overtime Date</Label>
              <Input
                type="date"
                value={otDate}
                onChange={(e) => handleOtDateChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Hours Worked</Label>
              <Input
                type="number"
                min={0.5}
                max={24}
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="e.g. 4"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Day Type</Label>
            <Select
              value={dayType}
              items={(Object.keys(CTO_MULTIPLIERS) as CtoDayType[]).map((t) => ({
                value: t,
                label: CTO_DAY_TYPE_LABELS[t],
              }))}
              onValueChange={(v) => {
                if (v) setDayType(v as CtoDayType);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select day type" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CTO_MULTIPLIERS) as CtoDayType[]).map((t) => (
                  <SelectItem key={t} value={t} label={CTO_DAY_TYPE_LABELS[t]}>
                    {CTO_DAY_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Auto-suggested from the overtime date (weekend → rest day, holiday
              calendar → holiday); override if the employee&apos;s rest day differs.
            </p>
          </div>
          {preview && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <p>
                {Number(hours)}h × {CTO_MULTIPLIERS[dayType]} ={" "}
                <span className="font-medium">{preview.rawEarned}h</span> COC
                {preview.storedEarned < preview.rawEarned ? (
                  <>
                    {" "}
                    → <span className="font-semibold text-amber-700 dark:text-amber-500">
                      {preview.storedEarned}h will be credited
                    </span>{" "}
                    <span className="text-xs text-muted-foreground">
                      (clamped by{" "}
                      {preview.clampedBy
                        .map((c) => (c === "monthly_cap" ? "40h/month cap" : "120h balance cap"))
                        .join(" and ")}
                      ; excess forfeited)
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground"> — within caps</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Earned this month: {preview.monthEarnedSoFar}h / 40h · Current
                balance: {preview.available}h / 120h
              </p>
              {preview.storedEarned <= 0 && (
                <p className="text-xs text-destructive">
                  Nothing can be credited — the applicable cap has been reached.
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Office Order / Authority No. (Optional)</Label>
            <Input
              value={officeOrderNo}
              onChange={(e) => setOfficeOrderNo(e.target.value)}
              placeholder="e.g. Office Order No. 2026-014"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Year-end budget preparation overtime"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={
              loading ||
              !employeeId ||
              !otDate ||
              !hours ||
              Number(hours) <= 0 ||
              (preview !== null && preview.storedEarned <= 0)
            }
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Record COC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

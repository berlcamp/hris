"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Loader2,
  Pin,
  Repeat,
  Shuffle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { commandSubstringFilter } from "@/lib/command-filter";
import {
  clearScheduleOverride,
  getScheduleCalendar,
  setScheduleOverride,
  type AssignableEmployee,
  type CalendarDay,
} from "@/lib/actions/rotation-actions";
import type { ScheduleRow } from "@/lib/actions/schedule-actions";
import { cn } from "@/lib/utils";
import { WEEKDAYS, scheduleLabel, shortTime } from "./rotation-manager";
import { resortMessage } from "./rotation-assigner";

// One employee's month: the schedule each day resolves to (a correction's pin,
// a per-date override, the rotation, else the base schedule Mon–Fri) and REST
// days. Clicking a day sets or clears a one-off override for that date.

const SOURCE_META = {
  pin: { icon: Pin, label: "Pinned by a correction" },
  override: { icon: Shuffle, label: "One-off override" },
  rotation: { icon: Repeat, label: "From the rotation" },
  base: { icon: null, label: "Base schedule" },
} as const;

function addMonths(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function longDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ScheduleCalendar({
  employees,
  schedules,
  today,
}: {
  employees: AssignableEmployee[];
  schedules: ScheduleRow[];
  today: string;
}) {
  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const [rotation, setRotation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CalendarDay | null>(null);
  const [mode, setMode] = useState<"schedule" | "rest">("schedule");
  const [scheduleId, setScheduleId] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const employee = employees.find((e) => e.id === employeeId);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const res = await getScheduleCalendar(employeeId, month);
      setDays(res.days);
      setRotation(res.rotation);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the calendar");
    } finally {
      setLoading(false);
    }
  }, [employeeId, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDay = (d: CalendarDay) => {
    if (d.source === "pin") {
      toast.info("This day's schedule was pinned by an approved correction. Change it through a correction.");
      return;
    }
    setEditing(d);
    setMode(d.restDay ? "rest" : "schedule");
    setScheduleId(d.restDay ? "" : (d.schedule_id ?? ""));
    setNote(d.override_note ?? "");
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await setScheduleOverride({
        employeeId,
        date: editing.date,
        scheduleId: mode === "rest" ? null : scheduleId,
        isRestDay: mode === "rest",
        note,
      });
      toast.success(`Schedule set for ${longDate(editing.date)}`, {
        description: resortMessage(res.resort),
      });
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await clearScheduleOverride(employeeId, editing.date);
      toast.success("Override removed", { description: resortMessage(res.resort) });
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the override");
    } finally {
      setSaving(false);
    }
  };

  // Monday-first grid with leading blanks.
  const leading = days && days.length > 0 ? (new Date(days[0].date + "T00:00:00Z").getUTCDay() + 6) % 7 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" role="combobox" className="h-9 w-[300px] justify-between font-normal" />
            }
          >
            <span className="truncate">{employee?.name ?? "Select employee…"}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command filter={commandSubstringFilter}>
              <CommandInput placeholder="Search employee…" />
              <CommandList>
                <CommandEmpty>No employee found.</CommandEmpty>
                <CommandGroup>
                  {employees.map((e) => (
                    <CommandItem
                      key={e.id}
                      value={e.name}
                      keywords={[String(e.biometric_no ?? ""), e.department ?? ""]}
                      onSelect={() => {
                        setEmployeeId(e.id);
                        setPickerOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", employeeId === e.id ? "opacity-100" : "opacity-0")} />
                      <span className="text-sm">{e.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="w-40 text-center text-sm font-medium" aria-live="polite">
            {monthLabel(month)}
          </div>
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />}

        {employee && (
          <div className="ml-auto text-xs text-muted-foreground">
            Base: {employee.base_schedule ?? "Default"} · Rotation: {rotation ?? "none"}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(["rotation", "override", "pin"] as const).map((k) => {
          const Icon = SOURCE_META[k].icon!;
          return (
            <span key={k} className="flex items-center gap-1">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {SOURCE_META[k].label}
            </span>
          );
        })}
        <span className="flex items-center gap-1">
          <span className="rounded border border-dashed px-1 text-[10px] font-medium">REST</span>
          no hours owed
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1 text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {Array.from({ length: leading }, (_, i) => (
            <div key={`blank-${i}`} aria-hidden />
          ))}
          {(days ?? []).map((d) => {
            const meta = SOURCE_META[d.source];
            const Icon = meta.icon;
            const isToday = d.date === today;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => openDay(d)}
                aria-label={`${longDate(d.date)}: ${d.restDay ? "rest day" : `${d.schedule_name ?? "schedule"} ${d.time_in} to ${d.time_out}`}. ${meta.label}.`}
                className={cn(
                  "flex min-h-20 flex-col items-start gap-1 rounded-lg border p-2 text-left transition-colors",
                  "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  d.restDay ? "border-dashed bg-muted/30" : "bg-card",
                  d.source === "override" && "border-primary/50",
                  isToday && "ring-1 ring-primary",
                )}
              >
                <span className="flex w-full items-center justify-between">
                  <span className={cn("text-xs font-semibold", isToday && "text-primary")}>
                    {Number(d.date.slice(8))}
                  </span>
                  {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                </span>
                {d.restDay ? (
                  <span className="rounded border border-dashed px-1 text-[10px] font-medium text-muted-foreground">
                    REST
                  </span>
                ) : (
                  <>
                    <span className="text-xs font-medium tabular-nums">
                      {shortTime(d.time_in)}–{shortTime(d.time_out)}
                    </span>
                    {d.break_start && d.break_end ? (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        break {shortTime(d.break_start)}–{shortTime(d.break_end)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">no break</span>
                    )}
                  </>
                )}
                {d.override_note && (
                  <span className="line-clamp-1 text-[10px] text-muted-foreground">{d.override_note}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? longDate(editing.date) : ""}</DialogTitle>
            <DialogDescription>
              A one-off schedule for {employee?.name} on this date. Punches already
              saved for the day are re-sorted right away.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "schedule" | "rest")}>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="schedule" />
                Works this schedule
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="rest" />
                Rest day — no hours owed
              </label>
            </RadioGroup>
            {mode === "schedule" && (
              <Select
                items={Object.fromEntries(schedules.map((s) => [s.id, `${s.name} (${scheduleLabel(s)})`]))}
                value={scheduleId || null}
                onValueChange={(v) => setScheduleId((v as string) ?? "")}
              >
                <SelectTrigger className="w-full" aria-label="Schedule">
                  <SelectValue placeholder="Choose a schedule" />
                </SelectTrigger>
                <SelectContent>
                  {schedules.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({scheduleLabel(s)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="override-note">Note</Label>
              <Textarea
                id="override-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional — e.g. Office Order 2026-114, swapped with J. Cruz"
              />
            </div>
          </div>
          <DialogFooter>
            {editing?.source === "override" && (
              <Button variant="ghost" onClick={clear} disabled={saving} className="sm:mr-auto">
                Remove override
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || (mode === "schedule" && !scheduleId)}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {!employeeId && <p className="text-sm text-muted-foreground">No employees to show.</p>}
    </div>
  );
}

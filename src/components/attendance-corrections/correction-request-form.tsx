"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  AlertTriangle,
  Lock,
  CalendarPlus,
  Check,
  ChevronsUpDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createCorrectionRequest,
  getCorrectionDraftDays,
  type CorrectableEmployee,
  type CorrectionDraftDay,
} from "@/lib/actions/attendance-correction-actions";
import { commandSubstringFilter } from "@/lib/command-filter";
import { employeeSearchKeywords } from "@/lib/employee-name-match";
import type { ScheduleRow } from "@/lib/actions/schedule-actions";
import type { CorrectionItemFormValues } from "@/lib/validations/attendance-correction-schema";
import {
  trailingDutyDate,
  weekendReasonFor,
} from "@/lib/attendance-corrections";
import {
  correctionWindowError,
  describeCorrectionWindow,
  isDateInCorrectionWindow,
  type CorrectionWindow,
} from "@/lib/correction-window";
import {
  CORRECTION_REASONS,
  NO_TIME_REASON_LABELS,
  type CorrectionReason,
} from "@/lib/constants";
import { formatManilaShortDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

// Sentinel values for the Select components — base-ui Select cannot hold null,
// and "" is reserved for its own empty state.
const INHERIT = "__inherit__";
const NO_REASON = "__none__";

// Indexed by CorrectionDraftDay.day_of_week, which the server computes so the
// weekday shown never depends on the browser's timezone.
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type Disposition = "update" | "clear_as_off";

interface DayDraft {
  include: boolean;
  disposition: Disposition;
  scheduleId: string;
  time_in_am: string;
  time_out_am: string;
  time_in_pm: string;
  time_out_pm: string;
  reason_in_am: string;
  reason_out_am: string;
  reason_in_pm: string;
  reason_out_pm: string;
}

function draftFor(day: CorrectionDraftDay): DayDraft {
  // A weekend day with no punches at all defaults every slot to SATURDAY /
  // SUNDAY, so it reads as a rest day rather than an absence
  // (buildAttendanceRecord clears is_absent whenever any reason is set). Only
  // when the day is genuinely blank: if the employee punched, those times are
  // the point of the correction and must not be papered over with a label.
  const blank =
    !day.time_in_am && !day.time_out_am && !day.time_in_pm && !day.time_out_pm;
  const weekend = weekendReasonFor(day.date);
  const fallback = blank && weekend ? weekend : NO_REASON;

  return {
    // Unchecked by default: an included day writes an attendance row and locks
    // its date against further requests, so inclusion is an explicit act. The
    // "Include all" control covers the common whole-range case.
    include: false,
    disposition: "update",
    scheduleId: day.schedule_id ?? INHERIT,
    time_in_am: day.time_in_am ?? "",
    time_out_am: day.time_out_am ?? "",
    time_in_pm: day.time_in_pm ?? "",
    time_out_pm: day.time_out_pm ?? "",
    reason_in_am: day.time_in_am_reason ?? fallback,
    reason_out_am: day.time_out_am_reason ?? fallback,
    reason_in_pm: day.time_in_pm_reason ?? fallback,
    reason_out_pm: day.time_out_pm_reason ?? fallback,
  };
}

const nullIfBlank = (v: string) => (v.trim() === "" ? null : v.trim());
const nullIfSentinel = (v: string, sentinel: string) =>
  v === sentinel ? null : v;

// CORRECTION_REASONS is a subset of NO_TIME_REASONS (it drops 'holiday'), so
// the existing DTR labels apply unchanged.
const REASON_ITEMS: { value: string; label: string }[] = [
  { value: NO_REASON, label: "—" },
  ...CORRECTION_REASONS.map((r) => ({
    value: r,
    label: NO_TIME_REASON_LABELS[r],
  })),
];

export function CorrectionRequestForm({
  employees,
  schedules,
  directApply = false,
  correctionWindow = null,
  prefill,
}: {
  employees: CorrectableEmployee[];
  schedules: ScheduleRow[];
  /** Reviewer-level roles file corrections that apply on save: proof optional,
   *  no approval step. Presentational only — createCorrectionRequest re-derives
   *  this from the caller's role and ignores anything the client claims. */
  directApply?: boolean;
  /** The payroll months a department may still correct, or null for a role with
   *  no date limit. Computed on the server from the Manila clock — the browser's
   *  own clock never decides this. Presentational, like directApply: both
   *  server actions re-derive the window and refuse anything outside it. */
  correctionWindow?: CorrectionWindow | null;
  /** Preselects employee and date, for the "Correct entry" action on the
   *  attendance table. Server-validated; only preselects, never authorises. */
  prefill?: { employeeId: string | null; date: string | null };
}) {
  const router = useRouter();
  const [empOpen, setEmpOpen] = useState(false);

  // Only honour a prefilled employee that is actually in reach — otherwise the
  // picker would show a selection the grid can never load.
  const prefilledEmployee =
    prefill?.employeeId && employees.some((e) => e.id === prefill.employeeId)
      ? prefill.employeeId
      : "";
  // Same for the date: "Correct entry" on the attendance table can point at a
  // day the caller's window has closed over, and prefilling it would put the
  // form in a state whose only outcome is an error on Load days.
  const prefilledDate =
    prefill?.date &&
    (!correctionWindow || isDateInCorrectionWindow(prefill.date, correctionWindow))
      ? prefill.date
      : "";
  const [employeeId, setEmployeeId] = useState(prefilledEmployee);
  const [dateFrom, setDateFrom] = useState(prefilledDate);
  const [dateTo, setDateTo] = useState(prefilledDate);

  const [days, setDays] = useState<CorrectionDraftDay[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>({});
  const [loadingDays, setLoadingDays] = useState(false);

  const [bulkSchedule, setBulkSchedule] = useState(INHERIT);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scheduleItems = useMemo(
    () => [
      { value: INHERIT, label: "Inherit (employee's schedule)" },
      ...schedules.map((s) => ({
        value: s.id,
        label: `${s.name} (${s.time_in}–${s.time_out})`,
      })),
    ],
    [schedules],
  );

  // Drafts are keyed by DUTY DATE, not attendance-log id: since migration 067 a
  // day with no attendance row can be corrected, and those rows have a null id.
  // duty_date is also what the apply function keys on, and what the table
  // enforces UNIQUE (request_id, duty_date) over.
  const includedDates = useMemo(
    () => Object.keys(drafts).filter((d) => drafts[d]?.include),
    [drafts],
  );

  const selectedEmployee = employees.find((e) => e.id === employeeId);

  const loadDays = async () => {
    if (!employeeId || !dateFrom || !dateTo) {
      toast.error("Pick an employee and a date range first.");
      return;
    }
    if (dateTo < dateFrom) {
      toast.error("The end date must not precede the start date.");
      return;
    }
    // Catch an out-of-window range before the round trip. The server checks it
    // again — this only saves the user a failed request when they typed a date
    // past the input's min/max rather than picking one.
    if (correctionWindow) {
      const windowError =
        correctionWindowError(dateFrom, correctionWindow) ??
        correctionWindowError(dateTo, correctionWindow);
      if (windowError) {
        toast.error(windowError);
        return;
      }
    }
    setLoadingDays(true);
    try {
      const result = await getCorrectionDraftDays(employeeId, dateFrom, dateTo);
      setDays(result);
      setDrafts(Object.fromEntries(result.map((d) => [d.date, draftFor(d)])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load those days.");
    }
    setLoadingDays(false);
  };

  const patch = (date: string, values: Partial<DayDraft>) =>
    setDrafts((prev) => ({ ...prev, [date]: { ...prev[date], ...values } }));

  const setAllIncluded = (include: boolean) =>
    setDrafts((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([date, d]) => [date, { ...d, include }]),
      ),
    );

  const applyBulkSchedule = () => {
    if (includedDates.length === 0) {
      toast.error("Include at least one day first.");
      return;
    }
    setDrafts((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([date, d]) => [
          date,
          d.include ? { ...d, scheduleId: bulkSchedule } : d,
        ]),
      ),
    );
    toast.success(`Schedule applied to ${includedDates.length} day(s).`);
  };

  // A midnight-crossing pin pulls the next morning's punches back onto the
  // pinned day, which empties the FOLLOWING calendar day — see the night-shift
  // worked example in the design spec. That trailing row still needs an
  // explicit disposition or computeAttendanceFlags marks it absent, so warn
  // when it falls outside the loaded range and cannot be dispositioned here.
  const trailingWarning = useMemo(() => {
    if (!days || includedDates.length === 0) return null;
    // Find a trailing date from the first included day pinned to a
    // midnight-crossing schedule. Scanning for the trailing date directly —
    // rather than testing "is any pin nocturnal?" and then re-deriving the
    // date from whichever pin happens to come first — keeps the two in step:
    // the first pinned schedule need not be the one that crosses midnight.
    let trailing: string | null = null;
    for (const date of includedDates) {
      const sid = drafts[date]?.scheduleId;
      if (!sid || sid === INHERIT) continue;
      const sched = schedules.find((s) => s.id === sid);
      const candidate = sched ? trailingDutyDate(dateTo, sched) : null;
      if (candidate) {
        trailing = candidate;
        break;
      }
    }
    if (!trailing) return null;
    // Already in range: the requester can disposition it in the grid below, so
    // there is nothing to warn about.
    if (days.some((d) => d.date === trailing)) return null;
    return trailing;
  }, [days, includedDates, drafts, schedules, dateTo]);

  const lockedIncluded = useMemo(
    () =>
      (days ?? []).filter(
        (d) => d.correction_locked && drafts[d.date]?.include,
      ).length,
    [days, drafts],
  );

  // Days being CREATED rather than edited. Called out separately because it is
  // the one case where approval adds a row that never existed.
  const createdIncluded = useMemo(
    () =>
      (days ?? []).filter((d) => !d.has_record && drafts[d.date]?.include)
        .length,
    [days, drafts],
  );

  const handleSubmit = async () => {
    if (includedDates.length === 0) {
      toast.error("Include at least one day to correct.");
      return;
    }
    if (reason.trim().length < 5) {
      toast.error("Describe the reason for this correction.");
      return;
    }
    // Only a department filing must justify itself with a document; a
    // reviewer-level role filing directly is the party that would have judged
    // it. The server enforces the same rule, and so does the schema.
    if (!file && !directApply) {
      toast.error("Attach the supporting document.");
      return;
    }

    const byDate = new Map((days ?? []).map((d) => [d.date, d]));
    // The reason sentinels come out of a Select whose only non-sentinel options
    // are CORRECTION_REASONS, so the narrowing cast is safe here — and the
    // server re-validates it through correctionRequestSchema regardless.
    const asReason = (v: string) =>
      nullIfSentinel(v, NO_REASON) as CorrectionReason | null;
    const items: CorrectionItemFormValues[] = includedDates.map((date) => {
      const d = drafts[date];
      const day = byDate.get(date)!;
      return {
        duty_date: date,
        // Null for a date with no attendance row — the item creates the day.
        attendance_log_id: day.id,
        disposition: d.disposition,
        proposed_schedule_id: nullIfSentinel(d.scheduleId, INHERIT),
        time_in_am: nullIfBlank(d.time_in_am),
        time_out_am: nullIfBlank(d.time_out_am),
        time_in_pm: nullIfBlank(d.time_in_pm),
        time_out_pm: nullIfBlank(d.time_out_pm),
        reason_in_am: asReason(d.reason_in_am),
        reason_out_am: asReason(d.reason_out_am),
        reason_in_pm: asReason(d.reason_in_pm),
        reason_out_pm: asReason(d.reason_out_pm),
      };
    });

    const proof = new FormData();
    if (file) proof.append("proof", file);

    setSubmitting(true);
    try {
      const { id, outcome } = await createCorrectionRequest(
        {
          employee_id: employeeId,
          date_from: dateFrom,
          date_to: dateTo,
          reason: reason.trim(),
          items,
        },
        proof,
      );
      if (!directApply) {
        toast.success("Correction request submitted for HR review.");
      } else if (outcome === "applied") {
        toast.success(
          `Attendance saved for ${items.length} day${items.length === 1 ? "" : "s"}.`,
        );
      } else {
        // Drift: something changed between loading the grid and saving. The
        // request stays live so it can be re-based rather than vanishing.
        toast.warning(
          "The attendance for these days changed while you were working. Nothing was saved — review the request and file it again.",
        );
      }
      router.push(`/attendance-corrections/${id}`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not submit the request.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Employee and period</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {correctionWindow && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              You can correct{" "}
              <span className="font-medium text-foreground">
                {describeCorrectionWindow(correctionWindow)}
              </span>
              . The current payroll month and the one before it stay open, and
              the oldest of them hangs on through the first 7 days of the month
              after it — ask HR to correct anything older.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="employee">Employee</Label>
              {/* A searchable Command list, not a plain Select: for a
                  direct-apply role this holds every active employee (~1,000),
                  which no dropdown can be scrolled through usefully. Same
                  substring filter and keyword set as the other employee
                  pickers, so either name order and the biometric number all
                  match. */}
              <Popover open={empOpen} onOpenChange={setEmpOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      id="employee"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    />
                  }
                >
                  <span className="truncate">
                    {selectedEmployee ? selectedEmployee.name : "Select an employee"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command filter={commandSubstringFilter}>
                    <CommandInput placeholder="Search employee..." />
                    <CommandList>
                      <CommandEmpty>No employee found.</CommandEmpty>
                      <CommandGroup>
                        {employees.map((e) => (
                          <CommandItem
                            key={e.id}
                            value={e.name}
                            keywords={employeeSearchKeywords(e)}
                            onSelect={() => {
                              setEmployeeId(e.id);
                              setDays(null);
                              setDrafts({});
                              setEmpOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                employeeId === e.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {e.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date_from">From</Label>
              {/* min/max keep the picker inside the payroll months a department
                  may still correct. Convenience only — the browser will happily
                  accept a typed-in date outside them, so getCorrectionDraftDays
                  and createCorrectionRequest both re-derive the window from the
                  server clock and refuse. Absent for direct-apply roles, whose
                  date reach is unrestricted. */}
              <Input
                id="date_from"
                type="date"
                min={correctionWindow?.from}
                max={correctionWindow?.to}
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setDays(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date_to">To</Label>
              <Input
                id="date_to"
                type="date"
                min={correctionWindow?.from}
                max={correctionWindow?.to}
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setDays(null);
                }}
              />
            </div>
          </div>
          <Button onClick={loadDays} disabled={loadingDays} size="sm">
            {loadingDays && <Loader2 className="h-4 w-4 animate-spin" />}
            Load days
          </Button>
        </CardContent>
      </Card>

      {days && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              2. Days to correct
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {includedDates.length} of {days.length} included
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {days.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                That range contains no days.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAllIncluded(true)}
                  >
                    Include all
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAllIncluded(false)}
                  >
                    Include none
                  </Button>
                  <div className="ml-auto flex items-end gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Apply schedule to included days
                      </Label>
                      <Select
                        value={bulkSchedule}
                        items={scheduleItems}
                        onValueChange={(v) => setBulkSchedule(v as string)}
                      >
                        <SelectTrigger className="w-[260px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {scheduleItems.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={applyBulkSchedule}
                    >
                      Apply
                    </Button>
                  </div>
                </div>

                {lockedIncluded > 0 && (
                  <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700">
                    <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      {lockedIncluded} included{" "}
                      {lockedIncluded === 1 ? "day was" : "days were"} already
                      corrected once. Filing again replaces what was approved
                      before.
                    </span>
                  </p>
                )}

                {createdIncluded > 0 && (
                  <p className="flex items-start gap-2 rounded-md border border-sky-500/40 bg-sky-500/5 p-3 text-sm text-sky-800">
                    <CalendarPlus className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      {createdIncluded} included{" "}
                      {createdIncluded === 1 ? "day has" : "days have"} no
                      attendance record at all. Approving this request creates{" "}
                      {createdIncluded === 1 ? "it" : "them"}.
                    </span>
                  </p>
                )}

                {trailingWarning && (
                  <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      A shift that crosses midnight pulls the next morning&apos;s
                      punches back onto the pinned day, which empties{" "}
                      <strong>{formatManilaShortDate(trailingWarning)}</strong>.
                      Extend the range to that date and set it to{" "}
                      <em>Clear as off</em>, or it will read as an absence.
                    </span>
                  </p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="w-10 py-2" />
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Currently</th>
                        <th className="py-2 pr-3">Disposition</th>
                        <th className="py-2 pr-3">Schedule</th>
                        <th className="py-2 pr-2">AM In</th>
                        <th className="py-2 pr-2">AM Out</th>
                        <th className="py-2 pr-2">PM In</th>
                        <th className="py-2 pr-2">PM Out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((day) => {
                        const d = drafts[day.date];
                        if (!d) return null;
                        const cleared = d.disposition === "clear_as_off";
                        const isWeekend =
                          day.day_of_week === 0 || day.day_of_week === 6;
                        const slots = [
                          ["time_in_am", "reason_in_am"],
                          ["time_out_am", "reason_out_am"],
                          ["time_in_pm", "reason_in_pm"],
                          ["time_out_pm", "reason_out_pm"],
                        ] as const;
                        return (
                          <tr
                            key={day.date}
                            className={cn(
                              "border-b align-top",
                              !d.include && "opacity-75",
                              isWeekend && "bg-muted/30",
                            )}
                          >
                            <td className="py-3">
                              <Checkbox
                                checked={d.include}
                                onCheckedChange={(v) =>
                                  patch(day.date, { include: !!v })
                                }
                                aria-label={`Include ${day.date}`}
                              />
                            </td>
                            <td className="py-3 pr-3 whitespace-nowrap">
                              <div className="font-medium">
                                {formatManilaShortDate(day.date)}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {DAY_NAMES[day.day_of_week]}
                                {day.correction_locked && " · corrected before"}
                              </div>
                            </td>
                            <td className="py-3 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                              {day.has_record ? (
                                <>
                                  <div>
                                    {[
                                      day.time_in_am,
                                      day.time_out_am,
                                      day.time_in_pm,
                                      day.time_out_pm,
                                    ]
                                      .map((t) => t ?? "—")
                                      .join(" / ")}
                                  </div>
                                  <div>
                                    {day.is_absent
                                      ? "absent"
                                      : `late ${day.late_minutes}m · UT ${day.undertime_minutes}m`}
                                  </div>
                                </>
                              ) : (
                                <span className="italic">no record</span>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              <Select
                                value={d.disposition}
                                items={[
                                  { value: "update", label: "Update" },
                                  {
                                    value: "clear_as_off",
                                    label: "Clear as off",
                                  },
                                ]}
                                onValueChange={(v) =>
                                  patch(day.date, {
                                    disposition: v as Disposition,
                                  })
                                }
                                disabled={!d.include}
                              >
                                <SelectTrigger className="w-[130px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="update">Update</SelectItem>
                                  <SelectItem value="clear_as_off">
                                    Clear as off
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-3 pr-3">
                              <Select
                                value={d.scheduleId}
                                items={scheduleItems}
                                onValueChange={(v) =>
                                  patch(day.date, { scheduleId: v as string })
                                }
                                disabled={!d.include}
                              >
                                <SelectTrigger className="w-[200px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {scheduleItems.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>
                                      {s.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            {slots.map(([timeKey, reasonKey]) => (
                              <td key={timeKey} className="py-3 pr-2">
                                <div className="space-y-1">
                                  <Input
                                    type="time"
                                    className="w-[110px]"
                                    value={d[timeKey]}
                                    disabled={!d.include || cleared}
                                    onChange={(e) =>
                                      patch(day.date, {
                                        [timeKey]: e.target.value,
                                      } as Partial<DayDraft>)
                                    }
                                  />
                                  <Select
                                    value={d[reasonKey]}
                                    items={REASON_ITEMS}
                                    onValueChange={(v) =>
                                      patch(day.date, {
                                        [reasonKey]: v as string,
                                      } as Partial<DayDraft>)
                                    }
                                    disabled={!d.include || cleared}
                                  >
                                    <SelectTrigger className="w-[110px] h-7 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {REASON_ITEMS.map((r) => (
                                        <SelectItem
                                          key={r.value}
                                          value={r.value}
                                        >
                                          {r.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong>Clear as off</strong> discards the day&apos;s punches
                  and marks it OFF — use it for the day a night-shift pin
                  empties out. Per-slot reasons print in a slot the layout
                  leaves blank; <strong>NO BREAK</strong> is for a day worked
                  straight through lunch.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {days && days.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Justification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for this correction</Label>
              <Textarea
                id="reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Assigned to night rotation per Office Order 2026-114"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proof">
                Supporting document
                {directApply && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    (optional)
                  </span>
                )}
              </Label>
              <Input
                id="proof"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                PDF, JPEG or PNG, up to 10 MB — the office order, duty roster or
                certification that backs this correction.{" "}
                {directApply
                  ? "Attach one where it exists; it is kept with the record either way."
                  : "Required."}
              </p>
            </div>
            {directApply && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700">
                This applies as soon as you save — there is no approval step.
                The days are written, locked against biometric re-imports, and
                recorded against your name.
              </p>
            )}
            <div className="flex justify-end">
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {directApply ? "Save attendance" : "Submit for review"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleCheck, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUnsettledReview } from "@/lib/actions/unsettled-review-actions";
import type { UnsettledItem } from "@/lib/unsettled-review";
import { cn } from "@/lib/utils";

// The review list. One row per unsettled day: the four DTR cells (blank ones
// flagged), the UT the DTR charges, the raw punches with their device, and a
// one-click path into the correction form for that employee and date.

const SLOTS = ["in_am", "out_am", "in_pm", "out_pm"] as const;

function to12h(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${period}`;
}

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function addMonths(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const hm = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;

export function UnsettledReview({
  directApply,
  departments,
  today,
}: {
  directApply: boolean;
  departments: { id: string; name: string }[];
  today: string;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [items, setItems] = useState<UnsettledItem[] | null>(null);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const needsDepartment = directApply && !departmentId;

  const load = useCallback(async () => {
    if (needsDepartment) {
      setItems(null);
      return;
    }
    setLoading(true);
    try {
      const res = await getUnsettledReview({ month, departmentId });
      setItems(res.items);
      setEmployeeCount(res.employeeCount);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load unsettled days");
    } finally {
      setLoading(false);
    }
  }, [month, departmentId, needsDepartment]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      (items ?? []).filter(
        (i) => !query || i.employeeName.toLowerCase().includes(query.toLowerCase()),
      ),
    [items, query],
  );
  const people = new Set(visible.map((i) => i.employeeId)).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {directApply && (
          <Select
            items={Object.fromEntries(departments.map((d) => [d.id, d.name]))}
            value={departmentId}
            onValueChange={(v) => setDepartmentId((v as string | null) ?? null)}
          >
            <SelectTrigger className="w-72" aria-label="Department">
              <SelectValue placeholder="Choose a department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="w-36 text-center text-sm font-medium" aria-live="polite">
            {monthLabel(month)}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMonth(addMonths(month, 1))}
            disabled={month >= today.slice(0, 7)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by employee"
            aria-label="Filter by employee"
          />
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />}
      </div>

      {needsDepartment ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Choose a department to see its unsettled days.
        </p>
      ) : items && items.length === 0 && !loading ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <CircleCheck className="h-8 w-8 text-green-600" aria-hidden />
          <p className="text-sm font-medium">Nothing to settle for {monthLabel(month)}</p>
          <p className="text-xs text-muted-foreground">
            Every day for the {employeeCount} employee{employeeCount === 1 ? "" : "s"} here has all its punches or a reason.
          </p>
        </div>
      ) : (
        items && (
          <>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{visible.length}</span> day
              {visible.length === 1 ? "" : "s"} to settle across{" "}
              <span className="font-medium text-foreground">{people}</span> employee
              {people === 1 ? "" : "s"}.
            </p>
            <div className="rounded-lg border">
              <Table className="min-w-[1040px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-20">Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>AM In</TableHead>
                    <TableHead>AM Out</TableHead>
                    <TableHead>PM In</TableHead>
                    <TableHead>PM Out</TableHead>
                    <TableHead>UT</TableHead>
                    <TableHead className="w-[30%]">Punches recorded</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((i) => (
                    <TableRow key={`${i.employeeId}_${i.date}`} className="align-top">
                      <TableCell>
                        <div className="font-medium tabular-nums">{shortDate(i.date)}</div>
                        <div className="text-xs text-muted-foreground">{i.dayOfWeek.slice(0, 3)}</div>
                      </TableCell>
                      <TableCell className="font-medium">{i.employeeName}</TableCell>
                      {SLOTS.map((slot, idx) => {
                        const v = i.cells[idx];
                        const blank = i.unsettled.includes(slot);
                        return (
                          <TableCell key={slot}>
                            {v ? (
                              <span className="whitespace-nowrap tabular-nums">{to12h(v)}</span>
                            ) : blank ? (
                              <span className="inline-flex h-6 items-center rounded-md border border-dashed border-amber-500/70 px-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                                Blank
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        <span
                          className={cn(
                            "font-mono tabular-nums",
                            i.utMinutes >= 240 ? "font-semibold text-destructive" : i.utMinutes > 0 ? "font-semibold" : "text-muted-foreground",
                          )}
                        >
                          {hm(i.utMinutes)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {i.punches.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No raw punches on file</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {i.punches.map((p, k) => (
                              <span
                                key={k}
                                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px]"
                                title={p.status ? `Device label: ${p.status}` : undefined}
                              >
                                <span className="font-mono tabular-nums">
                                  {to12h(p.time)}
                                  {p.date !== i.date ? " (+1)" : ""}
                                </span>
                                {p.device && <span className="text-muted-foreground">· {p.device}</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/attendance-corrections/new?employee=${i.employeeId}&date=${i.date}`}>
                          <Button size="sm" variant="outline">
                            {directApply ? "Fix" : "Request fix"}
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )
      )}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import {
  BookOpen,
  Clock,
  Repeat,
  Utensils,
  CircleDashed,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { buildGuideRows, type GuideRow } from "@/lib/dtr-guide-examples";

// How biometric punches become a DTR, by example. The rows are computed from
// the live sorting / charging rules (lib/dtr-guide-examples.ts), so what this
// guide shows is what the DTR prints.

const RULES = [
  {
    icon: Clock,
    title: "Earliest in, latest out",
    body: "An arrival keeps the first punch; a departure keeps the last.",
  },
  {
    icon: Repeat,
    title: "Repeat scans are ignored",
    body: "A punch within an hour of arriving, before mid-session, is the same arrival — not a time-out.",
  },
  {
    icon: Utensils,
    title: "One lunch punch goes to the nearer time",
    body: "Closer to 12:00 is AM Out; closer to 1:00 is PM In.",
  },
  {
    icon: CircleDashed,
    title: "Blank cells",
    body: "One blank in a session costs nothing until settled. A whole blank session (morning or afternoon) is a 4:00 half day.",
  },
] as const;

const SLOT_ORDER = ["in_am", "out_am", "in_pm", "out_pm"] as const;

function TimeCell({ row, index }: { row: GuideRow; index: number }) {
  const value = row.cells[index];
  if (value) {
    return <span className="whitespace-nowrap tabular-nums">{value}</span>;
  }
  // A no-break schedule has no AM Out / PM In at all.
  if (row.noBreak && (index === 1 || index === 2)) {
    return (
      <span className="text-muted-foreground" aria-label="Not used on this schedule">
        —
      </span>
    );
  }
  const toSettle = row.unsettled.includes(SLOT_ORDER[index]);
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border border-dashed px-2 text-xs font-medium",
        toSettle
          ? "border-amber-500/70 text-amber-700 dark:text-amber-400"
          : "border-border text-muted-foreground",
      )}
    >
      Blank
    </span>
  );
}

function UtCell({ row }: { row: GuideRow }) {
  if (row.utMinutes === 0) {
    return <span className="font-mono tabular-nums text-muted-foreground">0:00</span>;
  }
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span
        className={cn(
          "font-mono font-semibold tabular-nums",
          row.halfDay && "text-destructive",
        )}
      >
        {row.ut}
      </span>
      {row.halfDay && (
        <span className="text-[11px] leading-none text-destructive">half day</span>
      )}
    </span>
  );
}

export function DtrGuideDialog() {
  const rows = useMemo(() => buildGuideRows(), []);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <BookOpen className="h-4 w-4" aria-hidden />
        How DTR times are read
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-6xl">
        <DialogHeader className="border-b p-5">
          <DialogTitle className="text-base">How the DTR reads biometric punches</DialogTitle>
          <DialogDescription>
            Worked examples of how punches from any device fill AM In, AM Out, PM
            In, PM Out and UT. The sorting goes by time, not by the
            device&apos;s Check In / Break Out label.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {RULES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  {title}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="inline-flex h-5 items-center rounded-md border border-dashed border-amber-500/70 px-1.5 font-medium text-amber-700 dark:text-amber-400">
                Blank
              </span>
              to settle through a correction
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono font-semibold text-destructive">4:00</span>
              half day for a fully blank session
            </span>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">—</span>
              not used on a no-break schedule
            </span>
          </div>

          <div className="rounded-lg border">
            <Table className="min-w-[960px]">
              <TableCaption className="sr-only">
                Example punches and how each DTR cell is filled
              </TableCaption>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[26%]">Situation &amp; punches</TableHead>
                  <TableHead>AM In</TableHead>
                  <TableHead>AM Out</TableHead>
                  <TableHead>PM In</TableHead>
                  <TableHead>PM Out</TableHead>
                  <TableHead>UT</TableHead>
                  <TableHead className="w-[30%]">Why</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="align-top">
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{row.title}</div>
                      {row.schedule !== "regular" && (
                        <div className="text-xs text-muted-foreground">{row.scheduleLabel}</div>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {row.punches.map((p, i) => (
                          <span
                            key={`${p}-${i}`}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] tabular-nums"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    {[0, 1, 2, 3].map((i) => (
                      <TableCell key={i}>
                        <TimeCell row={row} index={i} />
                      </TableCell>
                    ))}
                    <TableCell>
                      <UtCell row={row} />
                    </TableCell>
                    <TableCell className="whitespace-normal text-xs leading-relaxed text-muted-foreground">
                      {row.note}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Examples use the regular 8:00 AM – 12:00 PM / 1:00 – 5:00 PM schedule
            unless marked. UT is lateness plus undertime. A half-day holiday, a
            leave, or a reason such as OB or NO BREAK on a session removes its
            charge. A day with no punches at all is an absence.
          </p>
        </div>

        <DialogFooter className="m-0" showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addMonths,
  addYears,
  endOfYear,
  format,
  startOfDay,
  startOfYear,
} from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { ExportCsvButton } from "@/components/tables/export-csv-button";
import type { UpcomingEligibleEmployee } from "@/lib/actions/nosi-actions";

type RangeValue = "1m" | "3m" | "6m" | "year" | "next-year";

const RANGE_OPTIONS: { value: RangeValue; label: string }[] = [
  { value: "1m", label: "Due within 1 month" },
  { value: "3m", label: "Due within 3 months" },
  { value: "6m", label: "Due within 6 months" },
  { value: "year", label: "Due this year" },
  { value: "next-year", label: "Due next year" },
];

const RANGE_LABEL: Record<RangeValue, string> = {
  "1m": "1 month",
  "3m": "3 months",
  "6m": "6 months",
  year: "the rest of this year",
  "next-year": "next year",
};

/**
 * Inclusive eligibility-date window [start, end] (in ms) for a given range.
 * All ranges except "next-year" start from today; "next-year" covers the
 * whole following calendar year.
 */
function windowFor(range: RangeValue, today: Date): { start: number; end: number } {
  const start = today.getTime();
  switch (range) {
    case "1m":
      return { start, end: addMonths(today, 1).getTime() };
    case "3m":
      return { start, end: addMonths(today, 3).getTime() };
    case "6m":
      return { start, end: addMonths(today, 6).getTime() };
    case "year":
      return { start, end: endOfYear(today).getTime() };
    case "next-year": {
      const nextYear = addYears(today, 1);
      return {
        start: startOfYear(nextYear).getTime(),
        end: endOfYear(nextYear).getTime(),
      };
    }
  }
}

export function NosiUpcomingTab({
  upcoming,
}: {
  upcoming: UpcomingEligibleEmployee[];
}) {
  const [range, setRange] = useState<RangeValue>("1m");

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    const { start, end } = windowFor(range, today);
    return upcoming.filter((emp) => {
      const ms = new Date(emp.eligibility_date).getTime();
      return ms >= start && ms <= end;
    });
  }, [upcoming, range]);

  const exportRows = useMemo(
    () =>
      filtered.map((emp) => ({
        employee: `${emp.last_name}, ${emp.first_name}`,
        department: emp.departments
          ? `${emp.departments.code} ${emp.departments.name}`
          : "",
        position: emp.positions?.title ?? "",
        current: `SG ${emp.salary_grade} — Step ${emp.step_increment}`,
        next_step: `Step ${emp.step_increment + 1}`,
        eligible_on: format(new Date(emp.eligibility_date), "MMM d, yyyy"),
        days_until: emp.days_until_eligibility,
      })),
    [filtered]
  );

  const exportColumns = [
    { key: "employee", header: "Employee" },
    { key: "department", header: "Department" },
    { key: "position", header: "Position" },
    { key: "current", header: "Current SG/Step" },
    { key: "next_step", header: "Next Step" },
    { key: "eligible_on", header: "Eligible On" },
    { key: "days_until", header: "Days Until" },
  ];

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Employees whose next step increment becomes due within{" "}
            {RANGE_LABEL[range]}.
          </p>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as RangeValue)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ExportCsvButton
              data={exportRows}
              columns={exportColumns}
              filename="nosi-upcoming-increments"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            No employees are due for a step increment within {RANGE_LABEL[range]}.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Current SG/Step</TableHead>
                <TableHead>Next Step</TableHead>
                <TableHead>Eligible On</TableHead>
                <TableHead>In</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <Link
                      href={`/employees/${emp.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {emp.last_name}, {emp.first_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {emp.departments ? (
                      <span>
                        <span className="font-mono text-xs text-muted-foreground mr-1">
                          {emp.departments.code}
                        </span>
                        {emp.departments.name}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={emp.positions?.title ?? undefined}>
                    {emp.positions?.title ?? "—"}
                  </TableCell>
                  <TableCell>
                    SG {emp.salary_grade} — Step {emp.step_increment}
                  </TableCell>
                  <TableCell>Step {emp.step_increment + 1}</TableCell>
                  <TableCell>
                    {format(new Date(emp.eligibility_date), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {emp.days_until_eligibility}{" "}
                      {emp.days_until_eligibility === 1 ? "day" : "days"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

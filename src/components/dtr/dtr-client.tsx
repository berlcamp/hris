"use client";

import { useEffect, useState, useTransition } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pdf } from "@react-pdf/renderer";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getMonthlyDtrBulk,
  getMonthlyDtrRoster,
  getMyMonthlyDtr,
} from "@/lib/actions/dtr-actions";
import { formatMonthLabel, isMonthKey } from "@/lib/month-range";
import { BulkDtrPdf } from "@/components/pdf/bulk-dtr-pdf";
import type { BulkDtrResult } from "@/lib/dtr-builder";

interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

/**
 * Which of the three tiers this user is on. The server decides the same thing
 * independently in resolveScope — this only shapes the controls, it does not
 * grant anything.
 */
export type DtrMode = "any-department" | "own-department" | "personal";

interface DtrClientProps {
  mode: DtrMode;
  /** Selectable departments. Only populated for "any-department". */
  departments: DepartmentOption[];
  /** The one department an "own-department" user may generate for. */
  lockedDepartment: DepartmentOption | null;
  /** The open months, newest first — the restricted window. */
  selectableMonths: string[];
}

function safeName(value: string) {
  return (value || "DTR").replace(/[^\w-]+/g, "_");
}

function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DtrClient({
  mode,
  departments,
  lockedDepartment,
  selectableMonths,
}: DtrClientProps) {
  const anyMonth = mode === "any-department";
  const [month, setMonth] = useState(selectableMonths[0]);
  const [departmentId, setDepartmentId] = useState<string>(
    lockedDepartment?.id ?? "",
  );

  const [available, setAvailable] = useState(0);
  // Distinguishes "no roster loaded yet" from "loaded, and nobody has entries".
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [loadingRoster, startRosterLoad] = useTransition();
  const [busy, setBusy] = useState(false);

  const departmentItems = Object.fromEntries(
    departments.map((d) => [d.id, d.name]),
  );
  const monthItems = Object.fromEntries(
    selectableMonths.map((m) => [m, formatMonthLabel(m)]),
  );

  const monthValid = isMonthKey(month);
  const canQuery =
    mode !== "personal" && monthValid && (!!departmentId || !!lockedDepartment);

  // The roster is the module's availability answer: it comes back holding only
  // the employees who actually have time entries in the month, so a count of
  // zero is precisely "there is nothing to download", not a failure.
  useEffect(() => {
    if (!canQuery) {
      setAvailable(0);
      setRosterLoaded(false);
      return;
    }
    let cancelled = false;
    setRosterLoaded(false);
    startRosterLoad(async () => {
      try {
        const { employees } = await getMonthlyDtrRoster(
          lockedDepartment ? null : departmentId,
          month,
        );
        if (cancelled) return;
        setAvailable(employees.length);
        setRosterLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setAvailable(0);
        setRosterLoaded(true);
        toast.error(
          err instanceof Error ? err.message : "Failed to load the roster",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [departmentId, month, canQuery, lockedDepartment]);

  const render = async (results: BulkDtrResult[], filename: string) => {
    const blob = await pdf(
      <BulkDtrPdf results={results} periodLabel={formatMonthLabel(month)} />,
    ).toBlob();
    downloadPdf(blob, filename);
  };

  const handleBulk = async () => {
    setBusy(true);
    try {
      const { department, results } = await getMonthlyDtrBulk(
        lockedDepartment ? null : departmentId,
        month,
      );
      if (results.length === 0) {
        toast.info("No DTRs are available for this month yet.");
        return;
      }
      const deptName = department?.code || department?.name || "Department";
      await render(results, `DTR_${safeName(deptName)}_${month}.pdf`);
      toast.success(
        `Downloaded ${results.length} DTR${results.length === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate the DTRs",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleMine = async () => {
    setBusy(true);
    try {
      const result = await getMyMonthlyDtr(month);
      if (!result) {
        toast.info(
          `No time entries were recorded for you in ${formatMonthLabel(month)}, so there is no DTR to download.`,
        );
        return;
      }
      await render(
        [result],
        `DTR_${safeName(result.employee.last_name)}_${month}.pdf`,
      );
      toast.success("DTR downloaded.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate the DTR",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          {mode === "any-department" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Department
              </label>
              <Select
                items={departmentItems}
                value={departmentId}
                onValueChange={(v) => v && setDepartmentId(v)}
              >
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {lockedDepartment && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Department
              </label>
              <div className="h-9 w-[280px] flex items-center px-3 border rounded-md text-sm bg-muted/40">
                {lockedDepartment.name}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Month
            </label>
            {anyMonth ? (
              // No month window for this tier, so a native month picker is
              // the honest control — a dropdown would have to invent a range.
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-[200px]"
              />
            ) : (
              <Select
                items={monthItems}
                value={month}
                onValueChange={(v) => v && setMonth(v)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {selectableMonths.map((m) => (
                    <SelectItem key={m} value={m}>
                      {formatMonthLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {mode === "personal" ? (
          <div className="border-t pt-5 space-y-3">
            <Button onClick={handleMine} disabled={!monthValid || busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Download my DTR
            </Button>
            <p className="text-xs text-muted-foreground">
              Your own CSC Form 48 DTR for {formatMonthLabel(month)}. Approved
              leaves, declared holidays and weekend rows are reflected
              automatically.
            </p>
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              {!monthValid ? (
                "Select a month to see which DTRs are available."
              ) : !canQuery ? (
                "Select a department to see which DTRs are available."
              ) : loadingRoster || !rosterLoaded ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking which DTRs are available…
                </span>
              ) : available === 0 ? (
                "No time entries were recorded for this department in this month, so there is nothing to download."
              ) : (
                `${available} employee${available === 1 ? "" : "s"} ${available === 1 ? "has" : "have"} a DTR available for this month.`
              )}
            </div>

            <div className="border-t pt-5 space-y-3">
              <Button
                onClick={handleBulk}
                disabled={!canQuery || available === 0 || busy}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Download all {available > 0 ? `(${available})` : ""}
              </Button>

              <p className="text-xs text-muted-foreground">
                One CSC Form 48 DTR page per employee, covering the whole of{" "}
                {monthValid ? formatMonthLabel(month) : "the selected month"}.
                The roster is everyone assigned or detailed to the department;
                approved leaves, declared holidays and weekend rows are
                reflected automatically, and the signatory is resolved from the
                department the employee is assigned or detailed to.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

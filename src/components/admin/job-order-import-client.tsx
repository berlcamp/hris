"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  importJobOrderAreasFromCsv,
  importJobOrderEmployeesFromCsv,
  type JoImportResult,
} from "@/lib/actions/job-order-csv-import-actions";

function ImportResultSummary({ result }: { result: JoImportResult }) {
  return (
    <div className="space-y-3 rounded-md border p-4 text-sm">
      <p className="font-medium">
        Inserted {result.inserted}, updated {result.updated}, skipped {result.skipped}.
      </p>

      {result.errors.length > 0 && (
        <div>
          <p className="font-medium text-destructive">Errors ({result.errors.length})</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-destructive">
            {result.errors.slice(0, 25).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {result.errors.length > 25 && (
            <p className="mt-1 text-xs text-muted-foreground">
              …and {result.errors.length - 25} more.
            </p>
          )}
        </div>
      )}

      {result.warnings.length > 0 && (
        <div>
          <p className="font-medium text-amber-600 dark:text-amber-500">
            Warnings ({result.warnings.length})
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {result.warnings.slice(0, 25).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {result.warnings.length > 25 && (
            <p className="mt-1 text-xs text-muted-foreground">
              …and {result.warnings.length - 25} more.
            </p>
          )}
        </div>
      )}

      {result.areasCreated.length > 0 && (
        <div>
          <p className="font-medium">
            Areas created automatically — review for typos ({result.areasCreated.length})
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {result.areasCreated.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function JobOrderImportClient() {
  const areasInputRef = useRef<HTMLInputElement>(null);
  const employeesInputRef = useRef<HTMLInputElement>(null);
  const [areasPending, setAreasPending] = useState(false);
  const [employeesPending, setEmployeesPending] = useState(false);
  const [areasResult, setAreasResult] = useState<JoImportResult | null>(null);
  const [employeesResult, setEmployeesResult] = useState<JoImportResult | null>(null);

  const runAreasImport = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file.");
      return;
    }
    setAreasPending(true);
    setAreasResult(null);
    try {
      const text = await file.text();
      const result = await importJobOrderAreasFromCsv(text);
      setAreasResult(result);
      if (result.errors.length > 0 && result.inserted === 0) {
        toast.error("Area import failed — see errors below.");
      } else {
        toast.success(`Inserted ${result.inserted} area(s); ${result.skipped} already existed.`);
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setAreasPending(false);
      if (areasInputRef.current) areasInputRef.current.value = "";
    }
  }, []);

  const runEmployeesImport = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file.");
      return;
    }
    setEmployeesPending(true);
    setEmployeesResult(null);
    try {
      const text = await file.text();
      const result = await importJobOrderEmployeesFromCsv(text);
      setEmployeesResult(result);
      if (result.errors.length > 0 && result.inserted === 0 && result.updated === 0) {
        toast.error("Employee import failed — see errors below.");
      } else {
        toast.success(
          `Inserted ${result.inserted}, updated ${result.updated}, skipped ${result.skipped}.`,
        );
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setEmployeesPending(false);
      if (employeesInputRef.current) employeesInputRef.current.value = "";
    }
  }, []);

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>1. Area assignments</CardTitle>
          <CardDescription>
            Optional pre-load. Column: <code className="text-xs">area_assigned</code>. Names
            already present (matched case- and whitespace-insensitively) are skipped, not
            duplicated. Any area not uploaded here is created automatically from the employee
            roster below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Areas CSV</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={areasInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void runAreasImport(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={areasPending}
                onClick={() => areasInputRef.current?.click()}
              >
                {areasPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload areas CSV
              </Button>
            </div>
          </div>
          {areasResult && <ImportResultSummary result={areasResult} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Job Order employees</CardTitle>
          <CardDescription>
            Columns (legacy <code className="text-xs">jos</code> table): id, fullname,
            area_assigned, sub_area, rate, previous_rate, gender, purok, barangay, has_atm,
            working_hours, account_number, sss_no, sss_ss, sss_ec, tax_number, tax_date,
            tax_issued, date_started, eligibility, recommended_by, remarks, remarks2,
            deleted_at. Rows are upserted on <code className="text-xs">id</code> (legacy_id), so
            re-uploading the same file updates in place rather than duplicating the roster. A
            row is only skipped for a missing/empty fullname, a missing/duplicate id, or an area
            that could not be created — every other bad value is imported as blank with a
            warning below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Employees CSV</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={employeesInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void runEmployeesImport(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={employeesPending}
                onClick={() => employeesInputRef.current?.click()}
              >
                {employeesPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload employees CSV
              </Button>
            </div>
          </div>
          {employeesResult && <ImportResultSummary result={employeesResult} />}
        </CardContent>
      </Card>
    </div>
  );
}

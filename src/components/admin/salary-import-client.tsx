"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  importEmployeeSalarySyncFromCsv,
  importSalaryGradeMatrixFromCsv,
} from "@/lib/actions/salary-csv-import-actions";

export function SalaryImportClient() {
  const matrixInputRef = useRef<HTMLInputElement>(null);
  const employeeInputRef = useRef<HTMLInputElement>(null);
  const [matrixPending, setMatrixPending] = useState(false);
  const [empPending, setEmpPending] = useState(false);
  const [tranche, setTranche] = useState("1");
  const [effectiveYear, setEffectiveYear] = useState(String(new Date().getFullYear()));

  const runMatrixImport = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file.");
      return;
    }
    const t = Number(tranche);
    const y = Number(effectiveYear);
    if (!Number.isInteger(t) || !Number.isInteger(y)) {
      toast.error("Tranche and effective year must be whole numbers.");
      return;
    }
    setMatrixPending(true);
    try {
      const text = await file.text();
      const result = await importSalaryGradeMatrixFromCsv(text, t, y);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const extra =
        result.rowErrors.length > 0
          ? ` ${result.rowErrors.length} row(s) skipped (see server log hints in toast).`
          : "";
      toast.success(`Upserted ${result.upserted} salary grade row(s).${extra}`);
      if (result.rowErrors.length > 0) {
        toast.message("Row warnings", {
          description: result.rowErrors.slice(0, 6).join("\n"),
        });
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setMatrixPending(false);
      matrixInputRef.current && (matrixInputRef.current.value = "");
    }
  }, [tranche, effectiveYear]);

  const runEmployeeImport = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file.");
      return;
    }
    setEmpPending(true);
    try {
      const text = await file.text();
      const result = await importEmployeeSalarySyncFromCsv(text);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Updated ${result.updated} employee(s); ${result.historyRowsInserted} salary_history row(s) inserted; ${result.skipped} skipped.`
      );
      if (result.errors.length > 0) {
        toast.message("Import issues", {
          description: result.errors.slice(0, 12).join("\n"),
        });
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setEmpPending(false);
      employeeInputRef.current && (employeeInputRef.current.value = "");
    }
  }, []);

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>1. Salary grade matrix (SSL)</CardTitle>
          <CardDescription>
            Columns: <code className="text-xs">grade</code>,{" "}
            <code className="text-xs">step</code>,{" "}
            <code className="text-xs">amount</code> (aliases: salary_grade, salary_amount). Rows are
            upserted on <code className="text-xs">grade + step + tranche</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="tranche">Tranche</Label>
              <Input
                id="tranche"
                type="number"
                min={1}
                value={tranche}
                onChange={(e) => setTranche(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eff-year">Effective year</Label>
              <Input
                id="eff-year"
                type="number"
                min={2000}
                max={2100}
                value={effectiveYear}
                onChange={(e) => setEffectiveYear(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Matrix CSV</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={matrixInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void runMatrixImport(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={matrixPending}
                onClick={() => matrixInputRef.current?.click()}
              >
                {matrixPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload matrix CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Per-employee salary sync</CardTitle>
          <CardDescription>
            Required: <code className="text-xs">employee_id</code> (uuid),{" "}
            <code className="text-xs">salary_grade</code>,{" "}
            <code className="text-xs">step_increment</code>,{" "}
            <code className="text-xs">salary_amount</code>. Dates may be{" "}
            <code className="text-xs">YYYY-MM-DD</code> or US{" "}
            <code className="text-xs">MM/DD/YYYY</code> (e.g. 05/01/2024). Updates{" "}
            <code className="text-xs">employees</code> and appends{" "}
            <code className="text-xs">salary_history</code> (reason{" "}
            <code className="text-xs">adjustment</code>) so NOSI eligibility sees the same SG/step.
            Optional: <code className="text-xs">history_effective_date</code> (defaults to today);{" "}
            <code className="text-xs">last_increment_date</code> /{" "}
            <code className="text-xs">basis_effective_date</code> for the NOSI basis row (if{" "}
            <code className="text-xs">basis_reason</code> is omitted: step 1 uses{" "}
            <code className="text-xs">initial</code>, any higher step uses{" "}
            <code className="text-xs">step_increment</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Employee CSV</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={employeeInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void runEmployeeImport(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={empPending}
                onClick={() => employeeInputRef.current?.click()}
              >
                {empPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload employee CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

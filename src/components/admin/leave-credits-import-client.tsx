"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { importLeaveCreditsFromCsv } from "@/lib/actions/leave-credits-csv-import-actions";

export function LeaveCreditsImportClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [lastErrors, setLastErrors] = useState<string[]>([]);

  const runImport = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file.");
      return;
    }
    setPending(true);
    setLastErrors([]);
    try {
      const text = await file.text();
      const result = await importLeaveCreditsFromCsv(text);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Imported ${result.imported} of ${result.processed} row(s); ${result.skipped} skipped.`
      );
      if (result.errors.length > 0) {
        setLastErrors(result.errors);
        toast.message("Row warnings", {
          description: result.errors.slice(0, 6).join("\n"),
        });
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setPending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Leave credits CSV import</CardTitle>
          <CardDescription>
            Two CSV formats are auto-detected:
            <br />
            <strong>Wide (one row per employee):</strong>{" "}
            <code className="text-xs">employee_id, vl, sl, spl, …</code>{" "}
            — column names match leave codes (case-insensitive). Empty cells
            are skipped. Optional <code className="text-xs">year</code> column;
            defaults to current year.
            <br />
            <strong>Long (one row per credit):</strong>{" "}
            <code className="text-xs">
              employee_id, leave_type_code, year, total_credits
            </code>
            .
            <br />
            Used credits are derived from approved leave applications;{" "}
            <code className="text-xs">used_credits</code> and{" "}
            <code className="text-xs">balance</code> columns are ignored.
            Re-importing replaces the prior CSV baseline; monthly accruals and
            approved deductions are preserved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Upload CSV</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void runImport(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => fileInputRef.current?.click()}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload leave credits CSV
              </Button>
            </div>
          </div>

          {lastErrors.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-semibold mb-2">
                {lastErrors.length} row warning(s) from last import
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-xs text-muted-foreground max-h-48 overflow-auto">
                {lastErrors.slice(0, 50).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {lastErrors.length > 50 && (
                  <li>… and {lastErrors.length - 50} more</li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  matchAndPreviewImport,
  importDahuaAttendance,
} from "@/lib/actions/attendance-actions";
import type { ImportPreviewRow } from "@/lib/actions/attendance-actions";
import { parseDahuaFile } from "@/lib/dahua-parse";
import { PastImportsPanel } from "@/components/attendance/past-imports-panel";

type Step = "upload" | "preview" | "importing" | "done";

// Mirrors normalizeImportDescription on the server. Kept in step by the server
// rejecting anything longer — this only stops the field growing past it.
const DESCRIPTION_MAX = 120;

const fmtShort = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

// A first draft of the description, so the required field is a confirmation
// rather than a blank box: the file that was uploaded and the range it covers.
// The importer is expected to replace it with something meaningful ("Main gate,
// 1st half of July"), but an untouched default still beats an empty cell.
function suggestDescription(fileName: string, dates: string[]): string {
  const sorted = [...dates].filter(Boolean).sort();
  const period =
    sorted.length > 0
      ? `${fmtShort(sorted[0])} – ${fmtShort(sorted[sorted.length - 1])}`
      : "";
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return [base, period].filter(Boolean).join(" · ").slice(0, DESCRIPTION_MAX);
}

export function DahuaImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [description, setDescription] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    protectedSkipped: number;
    errors: number;
    totalPunches: number;
    unmatchedPunches: number;
    dayRecords: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  const reset = useCallback(() => {
    setStep("upload");
    setPreviewRows([]);
    setDescription("");
    setOverwrite(false);
    setProgress(0);
    setResult(null);
    setLoading(false);
    setFileName("");
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFileName(file.name);

    try {
      const text = await file.text();
      const parsed = await parseDahuaFile(text);

      if (parsed.length === 0) {
        toast.error("No valid records found in the file");
        setLoading(false);
        return;
      }

      const preview = await matchAndPreviewImport(parsed);
      setPreviewRows(preview);
      setDescription(suggestDescription(file.name, preview.map((r) => r.date)));
      setStep("preview");
    } catch (err) {
      toast.error("Failed to parse file");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!description.trim()) {
      toast.error("Add a short description so this import can be found later.");
      return;
    }
    setStep("importing");
    setProgress(10);

    try {
      setProgress(30);
      const res = await importDahuaAttendance(previewRows, overwrite, description);
      setProgress(100);
      setResult(res);
      setStep("done");

      if (res.imported > 0) {
        toast.success(`Imported ${res.imported} attendance record(s)`);
      }
      if (res.errors > 0) {
        toast.error(`${res.errors} record(s) failed to import`);
      }

      router.refresh();
    } catch (err) {
      // Surface the server's own wording — a rejected description is something
      // the importer can fix, and "Import failed" does not say what to do.
      toast.error(err instanceof Error ? err.message : "Import failed");
      setStep("preview");
    }
  };

  const matchedCount = previewRows.filter((r) => r.matched).length;
  const unmatchedCount = previewRows.filter((r) => !r.matched).length;
  const conflictCount = previewRows.filter((r) => r.hasConflict).length;
  const uniqueDates = [...new Set(previewRows.map((r) => r.date))];
  const uniqueEmployees = [...new Set(previewRows.filter((r) => r.matched).map((r) => r.employeeNo))];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Upload className="h-4 w-4" />
        Import from Dahua
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Dahua Attendance Data</DialogTitle>
          <DialogDescription>
            Upload the file exported from your Dahua face recognition device via USB.
          </DialogDescription>
        </DialogHeader>

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <FileText className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">
                {loading ? "Parsing file..." : "Select a file from your Dahua device"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supported format: Dahua face recognition attendance export (XML or CSV)
              </p>
            </div>
            <label>
              <input
                type="file"
                accept=".xml,.csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
                disabled={loading}
              />
              <Button variant="default" size="sm" disabled={loading} render={<span />}>
                <Upload className="h-4 w-4" />
                Choose File
              </Button>
            </label>

            <div className="mt-4 w-full border-t pt-4">
              <PastImportsPanel />
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && (
          <div className="flex flex-col gap-3">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-3 px-1 shrink-0">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline">{previewRows.length} punches</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="default">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {matchedCount} matched
                </Badge>
              </div>
              {unmatchedCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <Badge variant="destructive">
                    <X className="h-3 w-3 mr-1" />
                    {unmatchedCount} unmatched
                  </Badge>
                </div>
              )}
              {conflictCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {conflictCount} conflicts
                  </Badge>
                </div>
              )}
              <Badge variant="outline">{uniqueEmployees.length} employees</Badge>
              <Badge variant="outline">{uniqueDates.length} date(s)</Badge>
            </div>

            {/* File info */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 shrink-0">
              <FileText className="h-3.5 w-3.5" />
              {fileName}
            </div>

            {/* Required description. This is what the Past Imports list shows,
                and the only way to tell two imports of the same period apart
                when one has to be re-run months later. */}
            <div className="flex flex-col gap-1.5 px-1 shrink-0">
              <Label htmlFor="import-description" className="text-sm">
                Description <span className="text-destructive">*</span>
              </Label>
              <Input
                id="import-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={DESCRIPTION_MAX}
                placeholder="e.g. Main gate device — 1st half of July"
                aria-describedby="import-description-help"
              />
              <p
                id="import-description-help"
                className="text-xs text-muted-foreground"
              >
                Shown in Past Imports so you can find this batch to re-run later.
              </p>
            </div>

            {/* Overwrite toggle */}
            {conflictCount > 0 && (
              <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/50 shrink-0">
                <Switch
                  id="overwrite"
                  checked={overwrite}
                  onCheckedChange={setOverwrite}
                />
                <Label htmlFor="overwrite" className="text-sm">
                  Overwrite existing records ({conflictCount} conflict
                  {conflictCount > 1 ? "s" : ""})
                </Label>
              </div>
            )}
          </div>
        )}

        {/* Step: Importing */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Importing attendance records...</p>
            <Progress value={progress} className="w-64" />
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && result && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-sm font-medium">Import Complete</p>
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                <p className="text-xs text-muted-foreground">Imported</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-muted-foreground">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </div>
              {result.protectedSkipped > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-600">
                    {result.protectedSkipped}
                  </p>
                  <p className="text-xs text-muted-foreground">Protected</p>
                </div>
              )}
              {result.errors > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-destructive">{result.errors}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              {result.totalPunches} punches collapsed into {result.dayRecords} employee-day
              record{result.dayRecords === 1 ? "" : "s"} (one row per employee per day).
              {result.unmatchedPunches > 0 &&
                ` ${result.unmatchedPunches} punch${
                  result.unmatchedPunches === 1 ? "" : "es"
                } belonged to employees not found in the system and were ignored.`}
              {result.protectedSkipped > 0 &&
                ` ${result.protectedSkipped} day${
                  result.protectedSkipped === 1 ? " was" : "s were"
                } left untouched because someone entered or corrected ${
                  result.protectedSkipped === 1 ? "it" : "them"
                } by hand.`}
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={matchedCount === 0 || !description.trim()}
              >
                Import {matchedCount} Record(s)
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => { setOpen(false); reset(); }}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  parseDahuaCsv,
  matchAndPreviewImport,
  importDahuaAttendance,
} from "@/lib/actions/attendance-actions";
import type { ImportPreviewRow } from "@/lib/actions/attendance-actions";

type Step = "upload" | "preview" | "importing" | "done";

export function DahuaImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  const reset = useCallback(() => {
    setStep("upload");
    setPreviewRows([]);
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
      const parsed = await parseDahuaCsv(text);

      if (parsed.length === 0) {
        toast.error("No valid records found in the CSV file");
        setLoading(false);
        return;
      }

      const preview = await matchAndPreviewImport(parsed);
      setPreviewRows(preview);
      setStep("preview");
    } catch (err) {
      toast.error("Failed to parse CSV file");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setStep("importing");
    setProgress(10);

    try {
      setProgress(30);
      const res = await importDahuaAttendance(previewRows, overwrite);
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
      toast.error("Import failed");
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
            Upload the CSV file exported from your Dahua face recognition device via USB.
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
                {loading ? "Parsing file..." : "Select a CSV file from your Dahua device"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supported format: Dahua face recognition attendance export (CSV)
              </p>
            </div>
            <label>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
                disabled={loading}
              />
              <Button variant="default" size="sm" disabled={loading} render={<span />}>
                <Upload className="h-4 w-4" />
                Choose CSV File
              </Button>
            </label>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && (
          <>
            {/* Summary badges */}
            <div className="flex flex-wrap gap-3 px-1">
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <FileText className="h-3.5 w-3.5" />
              {fileName}
            </div>

            {/* Preview table */}
            <ScrollArea className="flex-1 max-h-[40vh] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Employee No.</TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow
                      key={i}
                      className={
                        !row.matched
                          ? "bg-destructive/5"
                          : row.hasConflict
                          ? "bg-yellow-50 dark:bg-yellow-950/20"
                          : ""
                      }
                    >
                      <TableCell className="text-xs font-mono">
                        {row.employeeNo}
                      </TableCell>
                      <TableCell className="text-xs">{row.employeeName}</TableCell>
                      <TableCell className="text-xs">{row.date}</TableCell>
                      <TableCell className="text-xs font-mono">{row.time}</TableCell>
                      <TableCell>
                        {!row.matched ? (
                          <Badge variant="destructive" className="text-xs">
                            Not Found
                          </Badge>
                        ) : row.hasConflict ? (
                          <Badge variant="secondary" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Existing
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">
                            Ready
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {/* Overwrite toggle */}
            {conflictCount > 0 && (
              <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/50">
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
          </>
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
              {result.errors > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-destructive">{result.errors}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              )}
            </div>
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
                disabled={matchedCount === 0}
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

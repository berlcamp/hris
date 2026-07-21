"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getImportBatches,
  previewImportReplay,
  runImportReplay,
  type ImportBatchRow,
  type ReplayPreview,
} from "@/lib/actions/attendance-actions";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const plural = (n: number) => (n === 1 ? "" : "s");

// Lists saved imports and lets an attendance manager re-bucket a past import
// with the current logic (after a bucketing fix) — no re-upload. A confirm step
// shows how many days will be re-bucketed vs. skipped (manually edited since).
export function PastImportsPanel() {
  const router = useRouter();
  const [batches, setBatches] = useState<ImportBatchRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<ImportBatchRow | null>(null);
  const [preview, setPreview] = useState<ReplayPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBatches(await getImportBatches());
    } catch {
      toast.error("Failed to load past imports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startRerun = async (b: ImportBatchRow) => {
    setTarget(b);
    setPreview(null);
    setPreviewing(true);
    try {
      setPreview(await previewImportReplay(b.id));
    } catch {
      toast.error("Failed to prepare re-run");
      setTarget(null);
    } finally {
      setPreviewing(false);
    }
  };

  const confirmRerun = async () => {
    if (!target) return;
    setRunning(true);
    try {
      const res = await runImportReplay(target.id);
      toast.success(
        `Re-bucketed ${res.reBucketed} day${plural(res.reBucketed)}` +
          (res.skipped
            ? `, skipped ${res.skipped} manually edited`
            : ""),
      );
      setTarget(null);
      setPreview(null);
      router.refresh();
    } catch {
      toast.error("Re-run failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <History className="h-4 w-4" />
        Past imports
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : !batches || batches.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          No saved imports yet. Imports you run are saved here so they can be
          re-bucketed later without re-uploading.
        </p>
      ) : (
        <div className="max-h-56 divide-y overflow-y-auto rounded-md border">
          {batches.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {fmtDate(b.period_start)} – {fmtDate(b.period_end)}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {b.punch_count} punch{plural(b.punch_count)} ·{" "}
                  {fmtDateTime(b.imported_at)}
                  {b.imported_by_name ? ` · ${b.imported_by_name}` : ""}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => startRerun(b)}
                disabled={previewing && target?.id === b.id}
              >
                {previewing && target?.id === b.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Re-run
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={!!target && !!preview}
        onOpenChange={(o) => {
          if (!o && !running) {
            setTarget(null);
            setPreview(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-run this import?</AlertDialogTitle>
            <AlertDialogDescription>
              Re-buckets the saved punches with the current rules. Days you
              edited by hand are left untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {preview && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
              <li>
                <span className="font-semibold text-foreground">
                  {preview.daysToRebucket}
                </span>{" "}
                day{plural(preview.daysToRebucket)} will be re-bucketed.
              </li>
              {preview.daysToSkip > 0 && (
                <li>
                  <span className="font-semibold text-foreground">
                    {preview.daysToSkip}
                  </span>{" "}
                  skipped — manually edited since import.
                </li>
              )}
              {preview.unmatchedPunches > 0 && (
                <li>
                  {preview.unmatchedPunches} punch
                  {plural(preview.unmatchedPunches)} have no matching employee.
                </li>
              )}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmRerun();
              }}
              disabled={running}
            >
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Re-run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

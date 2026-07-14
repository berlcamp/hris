"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { saveVacancyCriteria } from "@/lib/actions/rsp-actions";
import type { RspAssessmentCriterion } from "@/lib/types";

interface CriterionRow {
  id?: string;
  name: string;
  weight: string;
  max_score: string;
}

interface CriteriaEditorDialogProps {
  vacancyId: string;
  criteria: RspAssessmentCriterion[];
  /** Criterion ids that already have scores (deleting them wipes the scores). */
  scoredCriterionIds: string[];
  disabled?: boolean;
}

export function CriteriaEditorDialog({
  vacancyId,
  criteria,
  scoredCriterionIds,
  disabled,
}: CriteriaEditorDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CriterionRow[]>([]);

  const scored = new Set(scoredCriterionIds);

  const openDialog = (next: boolean) => {
    setOpen(next);
    if (next) {
      setRows(
        criteria.map((c) => ({
          id: c.id,
          name: c.name,
          weight: String(c.weight),
          max_score: String(c.max_score),
        }))
      );
    }
  };

  const totalWeight = rows.reduce(
    (sum, r) => sum + (Number(r.weight) || 0),
    0
  );
  const weightsOk = Math.abs(totalWeight - 100) < 0.01;

  const removedScored = criteria.some(
    (c) => scored.has(c.id) && !rows.some((r) => r.id === c.id)
  );

  const updateRow = (index: number, patch: Partial<CriterionRow>) =>
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const handleSave = async () => {
    if (rows.length === 0) {
      toast.error("At least one criterion is required.");
      return;
    }
    if (rows.some((r) => !r.name.trim())) {
      toast.error("Every criterion needs a name.");
      return;
    }
    if (!weightsOk) {
      toast.error("Criterion weights must total exactly 100%.");
      return;
    }
    setLoading(true);
    const result = await saveVacancyCriteria(
      vacancyId,
      rows.map((r, i) => ({
        id: r.id,
        name: r.name.trim(),
        weight: Number(r.weight),
        max_score: Number(r.max_score) || 100,
        sort_order: i + 1,
      }))
    );
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Assessment criteria saved.");
      setOpen(false);
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" disabled={disabled} />}
      >
        <Settings2 className="h-4 w-4" />
        Edit Criteria
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>HRMPSB Assessment Criteria</DialogTitle>
          <DialogDescription>
            Comparative assessment criteria and weights per the agency Merit
            Selection Plan. Weights must total 100%. Weighted total = score ÷
            max × weight.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_90px_90px_32px] gap-2 text-xs text-muted-foreground">
            <span>Criterion</span>
            <span>Weight %</span>
            <span>Max Score</span>
            <span />
          </div>
          {rows.map((row, i) => (
            <div
              key={row.id ?? `new-${i}`}
              className="grid grid-cols-[1fr_90px_90px_32px] items-center gap-2"
            >
              <Input
                value={row.name}
                onChange={(e) => updateRow(i, { name: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={row.weight}
                onChange={(e) => updateRow(i, { weight: e.target.value })}
              />
              <Input
                type="number"
                min={1}
                value={row.max_score}
                onChange={(e) => updateRow(i, { max_score: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove criterion"
                onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((r) => [
                  ...r,
                  { name: "", weight: "0", max_score: "100" },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Add Criterion
            </Button>
            <span
              className={cn(
                "text-sm font-medium tabular-nums",
                weightsOk ? "text-muted-foreground" : "text-destructive"
              )}
            >
              Total: {totalWeight.toFixed(2)}%
            </span>
          </div>
          {removedScored && (
            <p className="text-sm text-destructive">
              Warning: you are removing a criterion that already has scores —
              those scores will be permanently deleted on save.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !weightsOk}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Criteria
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

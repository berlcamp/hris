"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveAssessmentScores } from "@/lib/actions/rsp-actions";
import type { RspApplicationWithApplicant } from "@/lib/actions/rsp-actions";
import type { RspAssessmentCriterion } from "@/lib/types";
import { formatApplicantName } from "@/lib/rsp-constants";

interface ScoreGridProps {
  vacancyId: string;
  candidates: RspApplicationWithApplicant[];
  criteria: RspAssessmentCriterion[];
  disabled?: boolean;
}

/** Raw HRMPSB scores per candidate per criterion; one batch save. */
export function ScoreGrid({
  vacancyId,
  candidates,
  criteria,
  disabled,
}: ScoreGridProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const app of candidates) {
      for (const s of app.rsp_assessment_scores) {
        initial[`${app.id}:${s.criterion_id}`] = String(s.score);
      }
    }
    return initial;
  });

  const key = (applicationId: string, criterionId: string) =>
    `${applicationId}:${criterionId}`;

  const handleSave = async () => {
    const entries: {
      application_id: string;
      criterion_id: string;
      score: number;
    }[] = [];
    for (const app of candidates) {
      for (const c of criteria) {
        const raw = scores[key(app.id, c.id)];
        if (raw == null || raw === "") continue;
        const value = Number(raw);
        if (Number.isNaN(value) || value < 0) {
          toast.error(
            `Invalid score for ${app.rsp_applicants?.last_name ?? "candidate"} — ${c.name}`
          );
          return;
        }
        if (value > c.max_score) {
          toast.error(
            `Score for "${c.name}" cannot exceed its maximum of ${c.max_score}`
          );
          return;
        }
        entries.push({
          application_id: app.id,
          criterion_id: c.id,
          score: value,
        });
      }
    }
    if (entries.length === 0) {
      toast.error("Enter at least one score.");
      return;
    }
    setLoading(true);
    const result = await saveAssessmentScores(vacancyId, entries);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Assessment scores saved.");
      router.refresh();
    }
    setLoading(false);
  };

  if (candidates.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No qualified candidates to assess yet. Screen the applications first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">Candidate</TableHead>
              {criteria.map((c) => (
                <TableHead key={c.id} className="min-w-28 text-center">
                  {c.name}
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    max {Number(c.max_score)} · {Number(c.weight)}%
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((app) => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">
                  {app.rsp_applicants
                    ? formatApplicantName(app.rsp_applicants)
                    : "Unknown"}
                </TableCell>
                {criteria.map((c) => (
                  <TableCell key={c.id} className="text-center">
                    <Input
                      type="number"
                      min={0}
                      max={Number(c.max_score)}
                      step="0.01"
                      className="mx-auto h-8 w-24 text-center"
                      disabled={disabled}
                      value={scores[key(app.id, c.id)] ?? ""}
                      onChange={(e) =>
                        setScores((s) => ({
                          ...s,
                          [key(app.id, c.id)]: e.target.value,
                        }))
                      }
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!disabled && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Scores
          </Button>
        </div>
      )}
    </div>
  );
}

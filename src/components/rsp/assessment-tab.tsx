"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  RspVacancyDetail,
  RankedCandidate,
} from "@/lib/actions/rsp-actions";
import type { SystemSettings } from "@/lib/actions/settings-actions";
import { CriteriaEditorDialog } from "@/components/rsp/criteria-editor-dialog";
import { ScoreGrid } from "@/components/rsp/score-grid";
import { RspLineupPdfButton } from "@/components/rsp/rsp-pdf-buttons";

interface AssessmentTabProps {
  vacancy: RspVacancyDetail;
  ranking: RankedCandidate[];
  settings: SystemSettings;
}

export function AssessmentTab({
  vacancy,
  ranking,
  settings,
}: AssessmentTabProps) {
  const criteria = vacancy.rsp_assessment_criteria;
  const candidates = vacancy.rsp_applications.filter((a) =>
    ["qualified", "selected"].includes(a.status)
  );
  const scoredCriterionIds = [
    ...new Set(
      vacancy.rsp_applications.flatMap((a) =>
        a.rsp_assessment_scores.map((s) => s.criterion_id)
      )
    ),
  ];
  const locked = ["filled", "cancelled"].includes(vacancy.status);

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>HRMPSB Comparative Assessment</CardTitle>
            <CardDescription>
              Consolidated board scores per criterion for each qualified
              candidate. Weighted total = score ÷ max × weight.
            </CardDescription>
          </div>
          <CriteriaEditorDialog
            vacancyId={vacancy.id}
            criteria={criteria}
            scoredCriterionIds={scoredCriterionIds}
            disabled={locked}
          />
        </CardHeader>
        <CardContent>
          <ScoreGrid
            vacancyId={vacancy.id}
            candidates={candidates}
            criteria={criteria}
            disabled={locked}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Selection Lineup</CardTitle>
            <CardDescription>
              Ranked comparative assessment result. Per ORAOHRA, the appointing
              authority may choose any candidate in the lineup — ties do not
              block selection.
            </CardDescription>
          </div>
          <RspLineupPdfButton
            vacancy={vacancy}
            ranking={ranking}
            settings={settings}
          />
        </CardHeader>
        <CardContent>
          {ranking.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              The lineup appears once qualified candidates have been scored.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Rank</TableHead>
                    <TableHead className="min-w-48">Candidate</TableHead>
                    {criteria.map((c) => (
                      <TableHead key={c.id} className="text-center">
                        {c.name}
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          {Number(c.weight)}%
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((cand) => (
                    <TableRow key={cand.application_id}>
                      <TableCell className="font-bold tabular-nums">
                        {cand.rank}
                      </TableCell>
                      <TableCell className="font-medium">
                        {cand.applicant_name}
                        {cand.status === "selected" && (
                          <Badge className="ml-2">Selected</Badge>
                        )}
                      </TableCell>
                      {criteria.map((c) => (
                        <TableCell
                          key={c.id}
                          className="text-center tabular-nums"
                        >
                          {cand.criterion_scores[c.id] != null
                            ? cand.criterion_scores[c.id]?.toFixed(2)
                            : "—"}
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-bold tabular-nums">
                        {cand.total.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {cand.incomplete && (
                          <Badge variant="outline">Incomplete scores</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import type {
  RspApplicationWithApplicant,
  RankedCandidate,
} from "@/lib/actions/rsp-actions";
import type { RspAssessmentCriterion } from "@/lib/types";

/**
 * Weighted ranking of qualified/selected candidates.
 * Total = Σ(score / max_score × weight); missing scores count as 0 and set
 * `incomplete`. Ties share a competition rank (1, 2, 2, 4) — per ORAOHRA the
 * appointing authority may choose any candidate in the lineup, so ties never
 * block selection.
 */
export function computeRanking(
  applications: RspApplicationWithApplicant[],
  criteria: RspAssessmentCriterion[]
): RankedCandidate[] {
  const candidates = applications.filter((a) =>
    ["qualified", "selected"].includes(a.status)
  );

  const ranked = candidates.map((app) => {
    const scoreByCriterion = new Map(
      app.rsp_assessment_scores.map((s) => [s.criterion_id, s.score])
    );
    let total = 0;
    let incomplete = false;
    const criterion_scores: Record<string, number | null> = {};

    for (const c of criteria) {
      const raw = scoreByCriterion.get(c.id);
      if (raw == null) {
        incomplete = true;
        criterion_scores[c.id] = null;
        continue;
      }
      const weighted = (Number(raw) / Number(c.max_score)) * Number(c.weight);
      criterion_scores[c.id] = Math.round(weighted * 100) / 100;
      total += weighted;
    }

    const a = app.rsp_applicants;
    return {
      application_id: app.id,
      applicant_id: app.applicant_id,
      applicant_name: a ? `${a.last_name}, ${a.first_name}` : "Unknown",
      status: app.status,
      criterion_scores,
      total: Math.round(total * 100) / 100,
      incomplete,
      rank: 0,
    };
  });

  ranked.sort((a, b) => b.total - a.total);
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].rank =
      i > 0 && ranked[i].total === ranked[i - 1].total
        ? ranked[i - 1].rank
        : i + 1;
  }
  return ranked;
}

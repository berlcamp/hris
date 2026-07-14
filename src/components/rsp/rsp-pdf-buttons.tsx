"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { RspPublicationPdf } from "@/components/pdf/rsp-publication-pdf";
import { RspLineupPdf } from "@/components/pdf/rsp-lineup-pdf";
import { CsForm33bPdf } from "@/components/pdf/cs-form-33b-pdf";
import { CsForm34bPdf } from "@/components/pdf/cs-form-34b-pdf";
import type {
  RspVacancyDetail,
  RankedCandidate,
} from "@/lib/actions/rsp-actions";
import type { RspAppointment } from "@/lib/types";
import type { SystemSettings } from "@/lib/actions/settings-actions";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

interface Signatory {
  name: string;
  position: string;
}

const DEFAULT_SIGNATORIES: Signatory[] = [
  { name: "", position: "HRMPSB Chairperson" },
  { name: "", position: "HRMPSB Member" },
  { name: "", position: "HRMPSB Member" },
];

/** Small dialog for entering HRMPSB signatory names before download. */
function SignatoriesDialog({
  title,
  description,
  buttonLabel,
  generating,
  onGenerate,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  generating: boolean;
  onGenerate: (signatories: Signatory[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [signatories, setSignatories] =
    useState<Signatory[]>(DEFAULT_SIGNATORIES);

  const update = (i: number, patch: Partial<Signatory>) =>
    setSignatories((s) =>
      s.map((row, j) => (j === i ? { ...row, ...patch } : row))
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <FileText className="h-4 w-4" />
        {buttonLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {signatories.map((s, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={s.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Leave blank for a blank line"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Position</Label>
                <Input
                  value={s.position}
                  onChange={(e) => update(i, { position: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              await onGenerate(signatories);
              setOpen(false);
            }}
            disabled={generating}
          >
            {generating && <Loader2 className="h-4 w-4 animate-spin" />}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Publication notice (RA 7041)
// ============================================================

export function RspPublicationPdfButton({
  vacancy,
  settings,
}: {
  vacancy: RspVacancyDetail;
  settings: SystemSettings;
}) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const blob = await pdf(
        <RspPublicationPdf
          lguName={settings.lgu_name}
          lguAddress={settings.lgu_address}
          positionTitle={vacancy.position_title}
          itemNumber={vacancy.item_number}
          organizationalUnit={vacancy.organizational_unit}
          placeOfAssignment={vacancy.place_of_assignment}
          salaryGrade={vacancy.salary_grade}
          monthlySalary={vacancy.monthly_salary}
          qsEducation={vacancy.qs_education}
          qsTraining={vacancy.qs_training}
          qsTrainingHours={vacancy.qs_training_hours}
          qsExperience={vacancy.qs_experience}
          qsExperienceYears={vacancy.qs_experience_years}
          qsEligibility={vacancy.qs_eligibility}
          publicationDate={vacancy.publication_date}
          closingDate={vacancy.closing_date}
          cscBulletinNo={vacancy.csc_bulletin_no}
        />
      ).toBlob();
      download(blob, `Publication-${vacancy.item_number}.pdf`);
    } catch {
      // Silently fail — PDF generation may not work in all environments
    }
    setGenerating(false);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleGenerate}
      disabled={generating}
    >
      {generating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileText className="h-4 w-4" />
      )}
      Publication Notice
    </Button>
  );
}

// ============================================================
// HRMPSB selection lineup / comparative assessment result
// ============================================================

export function RspLineupPdfButton({
  vacancy,
  ranking,
  settings,
}: {
  vacancy: RspVacancyDetail;
  ranking: RankedCandidate[];
  settings: SystemSettings;
}) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async (signatories: Signatory[]) => {
    setGenerating(true);
    try {
      const blob = await pdf(
        <RspLineupPdf
          lguName={settings.lgu_name}
          lguAddress={settings.lgu_address}
          positionTitle={vacancy.position_title}
          itemNumber={vacancy.item_number}
          organizationalUnit={vacancy.organizational_unit}
          salaryGrade={vacancy.salary_grade}
          publicationDate={vacancy.publication_date}
          closingDate={vacancy.closing_date}
          deliberationDate={vacancy.hrmpsb_deliberation_date}
          criteria={vacancy.rsp_assessment_criteria.map((c) => ({
            id: c.id,
            name: c.name,
            weight: Number(c.weight),
          }))}
          candidates={ranking.map((r) => ({
            rank: r.rank,
            name: r.applicant_name,
            criterionScores: r.criterion_scores,
            total: r.total,
            incomplete: r.incomplete,
          }))}
          signatories={signatories.filter((s) => s.name || s.position)}
        />
      ).toBlob();
      download(blob, `Selection-Lineup-${vacancy.item_number}.pdf`);
    } catch {
      // Silently fail — PDF generation may not work in all environments
    }
    setGenerating(false);
  };

  return (
    <SignatoriesDialog
      title="Selection Lineup PDF"
      description="Enter the HRMPSB signatories to print on the lineup (leave names blank for blank signature lines)."
      buttonLabel="Selection Lineup"
      generating={generating}
      onGenerate={handleGenerate}
    />
  );
}

// ============================================================
// CS Form No. 33-B — Appointment (LGU)
// ============================================================

export function CsForm33bPdfButton({
  vacancy,
  appointment,
  appointeeName,
  settings,
}: {
  vacancy: RspVacancyDetail;
  appointment: RspAppointment;
  appointeeName: string;
  settings: SystemSettings;
}) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const blob = await pdf(
        <CsForm33bPdf
          lguName={settings.lgu_name}
          lguAddress={settings.lgu_address}
          appointeeName={appointeeName}
          positionTitle={vacancy.position_title}
          itemNumber={appointment.item_number ?? vacancy.item_number}
          organizationalUnit={vacancy.organizational_unit}
          salaryGrade={vacancy.salary_grade}
          monthlySalary={vacancy.monthly_salary}
          nature={appointment.nature}
          natureOthers={appointment.nature_others}
          statusType={appointment.status_type}
          vice={appointment.vice}
          employmentPeriodFrom={appointment.employment_period_from}
          employmentPeriodTo={appointment.employment_period_to}
          dateOfSigning={appointment.date_of_signing}
          appointingAuthority={appointment.appointing_authority}
          appointingAuthorityPosition={
            appointment.appointing_authority_position
          }
          publicationDate={vacancy.publication_date}
          closingDate={vacancy.closing_date}
          deliberationDate={vacancy.hrmpsb_deliberation_date}
          oathDate={appointment.oath_date}
          assumptionDate={appointment.assumption_date}
        />
      ).toBlob();
      download(blob, `CS-Form-33B-${appointeeName.replace(/[^\w-]+/g, "_")}.pdf`);
    } catch {
      // Silently fail — PDF generation may not work in all environments
    }
    setGenerating(false);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleGenerate}
      disabled={generating}
    >
      {generating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileText className="h-4 w-4" />
      )}
      CS Form 33-B
    </Button>
  );
}

// ============================================================
// CS Form No. 34-B — HRMPSB certification (LGU)
// ============================================================

export function CsForm34bPdfButton({
  vacancy,
  appointment,
  appointeeName,
  settings,
}: {
  vacancy: RspVacancyDetail;
  appointment: RspAppointment;
  appointeeName: string;
  settings: SystemSettings;
}) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async (signatories: Signatory[]) => {
    setGenerating(true);
    try {
      const blob = await pdf(
        <CsForm34bPdf
          lguName={settings.lgu_name}
          lguAddress={settings.lgu_address}
          appointeeName={appointeeName}
          positionTitle={vacancy.position_title}
          itemNumber={appointment.item_number ?? vacancy.item_number}
          organizationalUnit={vacancy.organizational_unit}
          publicationDate={vacancy.publication_date}
          closingDate={vacancy.closing_date}
          deliberationDate={vacancy.hrmpsb_deliberation_date}
          signatories={signatories.filter((s) => s.name || s.position)}
        />
      ).toBlob();
      download(blob, `CS-Form-34B-${appointeeName.replace(/[^\w-]+/g, "_")}.pdf`);
    } catch {
      // Silently fail — PDF generation may not work in all environments
    }
    setGenerating(false);
  };

  return (
    <SignatoriesDialog
      title="CS Form 34-B PDF"
      description="Enter the HRMPSB signatories to print on the certification (leave names blank for blank signature lines)."
      buttonLabel="CS Form 34-B"
      generating={generating}
      onGenerate={handleGenerate}
    />
  );
}

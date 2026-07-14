"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { setDeliberationDate } from "@/lib/actions/rsp-actions";
import type { RspVacancyDetail } from "@/lib/actions/rsp-actions";
import type { SystemSettings } from "@/lib/actions/settings-actions";
import { RspPublicationPdfButton } from "@/components/rsp/rsp-pdf-buttons";
import { isVacancyExpired } from "@/lib/rsp-constants";

function displayDate(value: string | null): string {
  return value ? format(new Date(`${value}T00:00:00`), "MMMM d, yyyy") : "—";
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value ?? "—"}</p>
    </div>
  );
}

interface VacancyOverviewTabProps {
  vacancy: RspVacancyDetail;
  settings: SystemSettings;
}

export function VacancyOverviewTab({
  vacancy,
  settings,
}: VacancyOverviewTabProps) {
  const router = useRouter();
  const [delibOpen, setDelibOpen] = useState(false);
  const [delibDate, setDelibDate] = useState(
    vacancy.hrmpsb_deliberation_date ?? ""
  );
  const [loading, setLoading] = useState(false);
  const expired = isVacancyExpired(vacancy);

  const handleSetDeliberation = async () => {
    if (!delibDate) {
      toast.error("Select the deliberation date.");
      return;
    }
    setLoading(true);
    const result = await setDeliberationDate(vacancy.id, delibDate);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("HRMPSB deliberation date recorded.");
      setDelibOpen(false);
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <div className="grid gap-6 pt-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Position Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Item Number" value={vacancy.item_number} />
          <Field label="Position Title" value={vacancy.position_title} />
          <Field
            label="Office / Organizational Unit"
            value={vacancy.organizational_unit}
          />
          <Field
            label="Place of Assignment"
            value={vacancy.place_of_assignment}
          />
          <Field
            label="Salary Grade"
            value={vacancy.salary_grade ? `SG ${vacancy.salary_grade}` : null}
          />
          <Field
            label="Monthly Salary"
            value={
              vacancy.monthly_salary != null
                ? `₱${Number(vacancy.monthly_salary).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}`
                : null
            }
          />
          {vacancy.remarks && (
            <div className="sm:col-span-2">
              <Field label="Remarks" value={vacancy.remarks} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qualification Standards</CardTitle>
          <CardDescription>
            Minimum requirements applicants are screened against.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Education" value={vacancy.qs_education} />
          <Field
            label="Training"
            value={
              vacancy.qs_training ??
              (vacancy.qs_training_hours != null
                ? `${vacancy.qs_training_hours} hours`
                : null)
            }
          />
          <Field
            label="Experience"
            value={
              vacancy.qs_experience ??
              (vacancy.qs_experience_years != null
                ? `${vacancy.qs_experience_years} year(s)`
                : null)
            }
          />
          <Field label="Eligibility" value={vacancy.qs_eligibility} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Publication (RA 7041)</CardTitle>
            <CardDescription>
              Posting of at least 10 calendar days; the publication is valid
              for 9 months from the publication date.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={delibOpen} onOpenChange={setDelibOpen}>
              <DialogTrigger render={<Button variant="outline" size="sm" />}>
                <CalendarCheck className="h-4 w-4" />
                {vacancy.hrmpsb_deliberation_date
                  ? "Update Deliberation Date"
                  : "Set Deliberation Date"}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>HRMPSB Deliberation Date</DialogTitle>
                  <DialogDescription>
                    Date the Human Resource Merit Promotion and Selection Board
                    deliberated on the comparative assessment of candidates.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label>Deliberation Date</Label>
                  <Input
                    type="date"
                    value={delibDate}
                    onChange={(e) => setDelibDate(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDelibOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSetDeliberation}
                    disabled={loading || !delibDate}
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <RspPublicationPdfButton vacancy={vacancy} settings={settings} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field
            label="Publication Date"
            value={displayDate(vacancy.publication_date)}
          />
          <Field
            label="Closing Date"
            value={displayDate(vacancy.closing_date)}
          />
          <Field
            label="CSC Bulletin No."
            value={vacancy.csc_bulletin_no}
          />
          <Field
            label="Publication Valid Until"
            value={
              vacancy.publication_expiry_date ? (
                <span className={expired ? "text-destructive font-medium" : ""}>
                  {displayDate(vacancy.publication_expiry_date)}
                  {expired ? " (lapsed)" : ""}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Field
            label="HRMPSB Deliberation"
            value={displayDate(vacancy.hrmpsb_deliberation_date)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

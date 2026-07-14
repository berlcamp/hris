"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Ban, Loader2, UserCheck, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  cancelAppointment,
  deselectCandidate,
  selectCandidate,
  updateAppointment,
} from "@/lib/actions/rsp-actions";
import type {
  RspVacancyDetail,
  RankedCandidate,
} from "@/lib/actions/rsp-actions";
import type { RspAppointment } from "@/lib/types";
import type { SystemSettings } from "@/lib/actions/settings-actions";
import {
  APPOINTMENT_NATURE_LABELS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_TYPE_LABELS,
  APPOINTMENT_STATUS_VARIANT,
  formatApplicantName,
} from "@/lib/rsp-constants";
import { AppointmentForm } from "@/components/rsp/appointment-form";
import {
  CsForm33bPdfButton,
  CsForm34bPdfButton,
} from "@/components/rsp/rsp-pdf-buttons";

function displayDate(value: string | null): string {
  return value ? format(new Date(`${value}T00:00:00`), "MMMM d, yyyy") : "—";
}

interface AppointmentTabProps {
  vacancy: RspVacancyDetail;
  ranking: RankedCandidate[];
  appointment: RspAppointment | null;
  settings: SystemSettings;
}

export function AppointmentTab({
  vacancy,
  ranking,
  appointment,
  settings,
}: AppointmentTabProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const selectedApp = vacancy.rsp_applications.find(
    (a) => a.status === "selected"
  );
  const selectedName = selectedApp?.rsp_applicants
    ? formatApplicantName(selectedApp.rsp_applicants)
    : null;

  const handleSelect = async (applicationId: string) => {
    setBusy(true);
    const result = await selectCandidate(applicationId);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Candidate selected by the appointing authority.");
      router.refresh();
    }
    setBusy(false);
  };

  const handleDeselect = async () => {
    if (!selectedApp) return;
    setBusy(true);
    const result = await deselectCandidate(selectedApp.id);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Selection reverted.");
      router.refresh();
    }
    setBusy(false);
  };

  // ---- Stage 1: no selected candidate yet ----
  if (!selectedApp && !appointment) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Selection by the Appointing Authority</CardTitle>
          <CardDescription>
            After HRMPSB deliberation, the appointing authority (LCE) selects a
            candidate from the lineup. The vacancy must be closed first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vacancy.status !== "closed" ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {vacancy.status === "published"
                ? "Close the posting before selecting a candidate."
                : vacancy.status === "draft"
                  ? "Publish and close the vacancy before selection."
                  : "This vacancy is no longer open for selection."}
            </p>
          ) : ranking.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No qualified candidates in the lineup yet.
            </p>
          ) : (
            <ul className="divide-y">
              {ranking.map((cand) => (
                <li
                  key={cand.application_id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium">
                      <span className="mr-2 tabular-nums text-muted-foreground">
                        #{cand.rank}
                      </span>
                      {cand.applicant_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Total weighted score: {cand.total.toFixed(2)}
                      {cand.incomplete ? " (incomplete scores)" : ""}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={<Button size="sm" disabled={busy} />}
                    >
                      <UserCheck className="h-4 w-4" />
                      Select
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Select {cand.applicant_name}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Records the appointing authority&apos;s choice. Only
                          one candidate can be selected per vacancy.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleSelect(cand.application_id)}
                        >
                          Select Candidate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- Stage 2: candidate selected, no appointment yet ----
  if (selectedApp && (!appointment || appointment.status !== "issued")) {
    return (
      <div className="space-y-6 pt-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Selected Candidate</CardTitle>
              <CardDescription>
                Chosen by the appointing authority from the HRMPSB lineup.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeselect}
              disabled={busy}
            >
              <Undo2 className="h-4 w-4" />
              Revert Selection
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{selectedName}</p>
          </CardContent>
        </Card>
        <AppointmentForm
          applicationId={selectedApp.id}
          candidateName={selectedName ?? ""}
        />
      </div>
    );
  }

  // ---- Stage 3: appointment on record ----
  if (!appointment) return null;
  const appointeeApp = vacancy.rsp_applications.find(
    (a) => a.id === appointment.application_id
  );
  const appointeeName = appointeeApp?.rsp_applicants
    ? formatApplicantName(appointeeApp.rsp_applicants)
    : "—";

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              Appointment — {appointeeName}
              <Badge variant={APPOINTMENT_STATUS_VARIANT[appointment.status]}>
                {APPOINTMENT_STATUS_LABELS[appointment.status]}
              </Badge>
            </CardTitle>
            <CardDescription>
              {APPOINTMENT_NATURE_LABELS[appointment.nature]}
              {appointment.nature === "others" && appointment.nature_others
                ? ` (${appointment.nature_others})`
                : ""}{" "}
              · {APPOINTMENT_STATUS_TYPE_LABELS[appointment.status_type]}
              {appointment.item_number
                ? ` · Item ${appointment.item_number}`
                : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <CsForm33bPdfButton
              vacancy={vacancy}
              appointment={appointment}
              appointeeName={appointeeName}
              settings={settings}
            />
            <CsForm34bPdfButton
              vacancy={vacancy}
              appointment={appointment}
              appointeeName={appointeeName}
              settings={settings}
            />
            {appointment.status === "issued" && (
              <CancelAppointmentDialog appointmentId={appointment.id} />
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Date of Signing" value={displayDate(appointment.date_of_signing)} />
          <Info label="Oath of Office (CS Form 32)" value={displayDate(appointment.oath_date)} />
          <Info label="Assumption to Duty" value={displayDate(appointment.assumption_date)} />
          <Info label="Probation Ends" value={displayDate(appointment.probation_end_date)} />
          {appointment.vice && <Info label="Vice" value={appointment.vice} />}
          {appointment.employment_period_from && (
            <Info
              label="Employment Period"
              value={`${displayDate(appointment.employment_period_from)} — ${displayDate(appointment.employment_period_to)}`}
            />
          )}
          {appointment.appointing_authority && (
            <Info
              label="Appointing Authority"
              value={`${appointment.appointing_authority}${appointment.appointing_authority_position ? `, ${appointment.appointing_authority_position}` : ""}`}
            />
          )}
          {appointment.remarks && (
            <Info label="Remarks" value={appointment.remarks} />
          )}
        </CardContent>
      </Card>

      {appointment.status === "issued" && (
        <LifecycleForm appointment={appointment} />
      )}

      {appointment.status === "issued" && (
        <p className="text-sm text-muted-foreground">
          Once the appointee has assumed duty, create the employee record via
          the <span className="font-medium">Employees</span> module and link
          the plantilla item — this module keeps the recruitment record only.
        </p>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function LifecycleForm({ appointment }: { appointment: RspAppointment }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    oath_date: appointment.oath_date ?? "",
    assumption_date: appointment.assumption_date ?? "",
    probation_end_date: appointment.probation_end_date ?? "",
    remarks: appointment.remarks ?? "",
  });

  const set = (field: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setLoading(true);
    const result = await updateAppointment(appointment.id, form);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Appointment record updated.");
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record Lifecycle Dates</CardTitle>
        <CardDescription>
          Oath of office (CS Form 32) and assumption to duty. For
          original-permanent appointments the 6-month probation end is
          suggested from the assumption date when left blank.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>Oath of Office Date</Label>
          <Input
            type="date"
            value={form.oath_date}
            onChange={(e) => set("oath_date")(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Assumption Date</Label>
          <Input
            type="date"
            value={form.assumption_date}
            onChange={(e) => set("assumption_date")(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Probation End Date</Label>
          <Input
            type="date"
            value={form.probation_end_date}
            onChange={(e) => set("probation_end_date")(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Remarks</Label>
          <Input
            value={form.remarks}
            onChange={(e) => set("remarks")(e.target.value)}
          />
        </div>
        <div className="flex justify-end sm:col-span-2 lg:col-span-4">
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Dates
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CancelAppointmentDialog({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<
    "disapproved" | "recalled" | "cancelled" | ""
  >("");
  const [remarks, setRemarks] = useState("");

  const STATUS_ITEMS = [
    { value: "disapproved", label: "Disapproved by CSC" },
    { value: "recalled", label: "Recalled" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const handleSubmit = async () => {
    if (!status || !remarks.trim()) {
      toast.error("Select the action and state the reason.");
      return;
    }
    setLoading(true);
    const result = await cancelAppointment(appointmentId, {
      status,
      remarks: remarks.trim(),
    });
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success(
        "Appointment updated. The vacancy reverted to closed for re-selection."
      );
      setOpen(false);
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Ban className="h-4 w-4" />
        Disapprove / Recall
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disapprove, Recall, or Cancel Appointment</DialogTitle>
          <DialogDescription>
            The vacancy reverts to closed and the candidate returns to the
            lineup, so a new selection or reissue is possible within the
            publication validity.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Action *</Label>
            <Select
              value={status}
              items={STATUS_ITEMS}
              onValueChange={(v) =>
                setStatus(
                  (v as "disapproved" | "recalled" | "cancelled") ?? ""
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ITEMS.map((o) => (
                  <SelectItem key={o.value} value={o.value} label={o.label}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. CSC disapproval — appointee lacks eligibility"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Back
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={loading || !status || !remarks.trim()}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSignature, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createAppointment } from "@/lib/actions/rsp-actions";
import { appointmentFormSchema } from "@/lib/validations/rsp-schema";
import {
  APPOINTMENT_NATURES,
  APPOINTMENT_NATURE_LABELS,
  APPOINTMENT_STATUS_TYPES,
  APPOINTMENT_STATUS_TYPE_LABELS,
} from "@/lib/rsp-constants";

const NATURE_ITEMS = APPOINTMENT_NATURES.map((n) => ({
  value: n,
  label: APPOINTMENT_NATURE_LABELS[n],
}));
const STATUS_TYPE_ITEMS = APPOINTMENT_STATUS_TYPES.map((s) => ({
  value: s,
  label: APPOINTMENT_STATUS_TYPE_LABELS[s],
}));

interface AppointmentFormProps {
  applicationId: string;
  candidateName: string;
}

export function AppointmentForm({
  applicationId,
  candidateName,
}: AppointmentFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [overrideExpiry, setOverrideExpiry] = useState(false);
  const [form, setForm] = useState({
    nature: "",
    nature_others: "",
    status_type: "",
    vice: "",
    date_of_signing: "",
    employment_period_from: "",
    employment_period_to: "",
    appointing_authority: "",
    appointing_authority_position: "",
    remarks: "",
  });

  const set = (field: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const needsPeriod = ["casual", "contractual", "temporary"].includes(
    form.status_type
  );

  const handleSubmit = async () => {
    const parsed = appointmentFormSchema.safeParse({
      application_id: applicationId,
      ...form,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid form data");
      return;
    }
    setLoading(true);
    const result = await createAppointment({
      ...parsed.data,
      override_expiry: overrideExpiry,
    });
    if ("error" in result && result.error) {
      toast.error(result.error);
      if ("needs_override" in result && result.needs_override) {
        setOverrideExpiry(true);
        toast.info(
          "Submit again to confirm issuing the appointment past the publication validity."
        );
      }
    } else {
      toast.success("Appointment issued. The vacancy is now marked filled.");
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignature className="h-5 w-5" />
          Issue Appointment — {candidateName}
        </CardTitle>
        <CardDescription>
          Details as they will appear on CS Form No. 33-B. A 6-month
          probationary period is suggested automatically for original-permanent
          appointments.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Nature of Appointment *</Label>
          <Select
            value={form.nature}
            items={NATURE_ITEMS}
            onValueChange={(v) => set("nature")(v ?? "")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {NATURE_ITEMS.map((o) => (
                <SelectItem key={o.value} value={o.value} label={o.label}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status of Appointment *</Label>
          <Select
            value={form.status_type}
            items={STATUS_TYPE_ITEMS}
            onValueChange={(v) => set("status_type")(v ?? "")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {STATUS_TYPE_ITEMS.map((o) => (
                <SelectItem key={o.value} value={o.value} label={o.label}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.nature === "others" && (
          <div className="space-y-2 sm:col-span-2">
            <Label>Specify Nature *</Label>
            <Input
              value={form.nature_others}
              onChange={(e) => set("nature_others")(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label>Date of Signing *</Label>
          <Input
            type="date"
            value={form.date_of_signing}
            onChange={(e) => set("date_of_signing")(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Vice (whom replaced)</Label>
          <Input
            value={form.vice}
            onChange={(e) => set("vice")(e.target.value)}
            placeholder="e.g. Juan Dela Cruz, who retired"
          />
        </div>
        {needsPeriod && (
          <>
            <div className="space-y-2">
              <Label>Employment Period From *</Label>
              <Input
                type="date"
                value={form.employment_period_from}
                onChange={(e) => set("employment_period_from")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Employment Period To *</Label>
              <Input
                type="date"
                value={form.employment_period_to}
                onChange={(e) => set("employment_period_to")(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="space-y-2">
          <Label>Appointing Authority</Label>
          <Input
            value={form.appointing_authority}
            onChange={(e) => set("appointing_authority")(e.target.value)}
            placeholder="Name of the Local Chief Executive"
          />
        </div>
        <div className="space-y-2">
          <Label>Authority&apos;s Position</Label>
          <Input
            value={form.appointing_authority_position}
            onChange={(e) =>
              set("appointing_authority_position")(e.target.value)
            }
            placeholder="e.g. Municipal Mayor"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Remarks</Label>
          <Textarea
            rows={2}
            value={form.remarks}
            onChange={(e) => set("remarks")(e.target.value)}
          />
        </div>
        <div className="flex justify-end sm:col-span-2">
          <Button
            onClick={handleSubmit}
            disabled={
              loading ||
              !form.nature ||
              !form.status_type ||
              !form.date_of_signing
            }
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {overrideExpiry
              ? "Issue Appointment (override validity)"
              : "Issue Appointment"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

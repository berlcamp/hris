"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { createApplication, getApplicants } from "@/lib/actions/rsp-actions";
import type { RspApplicant } from "@/lib/types";
import { applicationFormSchema } from "@/lib/validations/rsp-schema";
import { formatApplicantName } from "@/lib/rsp-constants";
import { ApplicantFormDialog } from "@/components/rsp/applicant-form-dialog";

interface AddApplicationDialogProps {
  vacancyId: string;
  /** Applicant ids that already applied to this vacancy (hidden in the picker). */
  existingApplicantIds: string[];
}

export function AddApplicationDialog({
  vacancyId,
  existingApplicantIds,
}: AddApplicationDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applicants, setApplicants] = useState<RspApplicant[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [applicantId, setApplicantId] = useState("");
  const [dateReceived, setDateReceived] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [credentials, setCredentials] = useState({
    education: "",
    training: "",
    training_hours: "",
    experience: "",
    experience_years: "",
    eligibility: "",
  });

  useEffect(() => {
    if (!open) return;
    getApplicants().then(setApplicants).catch(() => setApplicants([]));
  }, [open]);

  const taken = useMemo(
    () => new Set(existingApplicantIds),
    [existingApplicantIds]
  );
  const available = useMemo(
    () => applicants.filter((a) => !taken.has(a.id)),
    [applicants, taken]
  );
  const selected = useMemo(
    () => applicants.find((a) => a.id === applicantId) ?? null,
    [applicants, applicantId]
  );

  const setCred = (field: keyof typeof credentials) => (value: string) =>
    setCredentials((c) => ({ ...c, [field]: value }));

  const handleSubmit = async () => {
    const parsed = applicationFormSchema.safeParse({
      vacancy_id: vacancyId,
      applicant_id: applicantId,
      date_received: dateReceived,
      ...credentials,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid form data");
      return;
    }
    setLoading(true);
    const result = await createApplication(parsed.data);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Application received.");
      setOpen(false);
      setApplicantId("");
      setCredentials({
        education: "",
        training: "",
        training_hours: "",
        experience: "",
        experience_years: "",
        eligibility: "",
      });
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4" />
        Receive Application
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Receive Application</DialogTitle>
          <DialogDescription>
            Record an application for this vacancy with the applicant&apos;s
            credentials as of application. These are compared against the QS
            during screening.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Applicant *</Label>
            <div className="flex gap-2">
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      role="combobox"
                      className="flex-1 justify-between font-normal"
                    />
                  }
                >
                  {selected
                    ? formatApplicantName(selected)
                    : "Select applicant..."}
                  <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search applicants..." />
                    <CommandList>
                      <CommandEmpty>
                        No applicants found. Add one with the + button.
                      </CommandEmpty>
                      <CommandGroup>
                        {available.map((a) => (
                          <CommandItem
                            key={a.id}
                            value={`${a.last_name} ${a.first_name}`}
                            onSelect={() => {
                              setApplicantId(a.id);
                              setPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                applicantId === a.id
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {formatApplicantName(a)}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <ApplicantFormDialog
                trigger={
                  <Button variant="outline" size="icon" aria-label="New applicant">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                }
                onCreated={(a) => {
                  setApplicants((list) => [...list, a]);
                  setApplicantId(a.id);
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Date Received *</Label>
            <Input
              type="date"
              value={dateReceived}
              onChange={(e) => setDateReceived(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Education</Label>
              <Textarea
                rows={2}
                value={credentials.education}
                onChange={(e) => setCred("education")(e.target.value)}
                placeholder="Highest educational attainment"
              />
            </div>
            <div className="space-y-2">
              <Label>Training</Label>
              <Textarea
                rows={2}
                value={credentials.training}
                onChange={(e) => setCred("training")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Training Hours</Label>
              <Input
                type="number"
                min={0}
                value={credentials.training_hours}
                onChange={(e) => setCred("training_hours")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Experience</Label>
              <Textarea
                rows={2}
                value={credentials.experience}
                onChange={(e) => setCred("experience")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Experience (years)</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={credentials.experience_years}
                onChange={(e) => setCred("experience_years")(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Eligibility</Label>
              <Textarea
                rows={2}
                value={credentials.eligibility}
                onChange={(e) => setCred("eligibility")(e.target.value)}
                placeholder="e.g. CS Professional, RA 1080"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !applicantId || !dateReceived}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Receive Application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, TriangleAlert } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createApplicant,
  updateApplicant,
  findPossibleDuplicates,
} from "@/lib/actions/rsp-actions";
import type { RspApplicant } from "@/lib/types";
import { applicantFormSchema } from "@/lib/validations/rsp-schema";
import { formatApplicantName } from "@/lib/rsp-constants";

const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

interface ApplicantFormDialogProps {
  /** When set, the dialog edits this applicant instead of creating one. */
  applicant?: RspApplicant;
  trigger?: React.ReactElement;
  /** Called with the created applicant (create mode only). */
  onCreated?: (applicant: RspApplicant) => void;
}

interface FormState {
  last_name: string;
  first_name: string;
  middle_name: string;
  name_extension: string;
  sex: string;
  birth_date: string;
  address: string;
  email: string;
  mobile_no: string;
  notes: string;
}

function toFormState(applicant?: RspApplicant): FormState {
  return {
    last_name: applicant?.last_name ?? "",
    first_name: applicant?.first_name ?? "",
    middle_name: applicant?.middle_name ?? "",
    name_extension: applicant?.name_extension ?? "",
    sex: applicant?.sex ?? "",
    birth_date: applicant?.birth_date ?? "",
    address: applicant?.address ?? "",
    email: applicant?.email ?? "",
    mobile_no: applicant?.mobile_no ?? "",
    notes: applicant?.notes ?? "",
  };
}

export function ApplicantFormDialog({
  applicant,
  trigger,
  onCreated,
}: ApplicantFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(toFormState(applicant));
  const [duplicates, setDuplicates] = useState<RspApplicant[]>([]);

  const set = (field: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  // Non-blocking dedup hint (create mode): warn when a similar name exists
  useEffect(() => {
    if (applicant || !open) return;
    const last = form.last_name.trim();
    const first = form.first_name.trim();
    const timer = setTimeout(async () => {
      if (last.length < 2 || first.length < 2) {
        setDuplicates([]);
        return;
      }
      const matches = await findPossibleDuplicates({
        last_name: last,
        first_name: first,
      });
      setDuplicates(matches);
    }, 400);
    return () => clearTimeout(timer);
  }, [applicant, open, form.last_name, form.first_name]);

  const handleSubmit = async () => {
    const parsed = applicantFormSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid form data");
      return;
    }
    setLoading(true);
    if (applicant) {
      const result = await updateApplicant(applicant.id, parsed.data);
      if ("error" in result && result.error) toast.error(result.error);
      else {
        toast.success("Applicant updated.");
        setOpen(false);
        router.refresh();
      }
    } else {
      const result = await createApplicant(parsed.data);
      if ("error" in result && result.error) {
        toast.error(result.error);
      } else if ("data" in result && result.data) {
        toast.success("Applicant added.");
        setOpen(false);
        setForm(toFormState());
        onCreated?.(result.data as RspApplicant);
        router.refresh();
      }
    }
    setLoading(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setForm(toFormState(applicant));
      }}
    >
      <DialogTrigger render={trigger ?? <Button variant="outline" size="sm" />}>
        {trigger ? undefined : applicant ? "Edit" : "Add Applicant"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {applicant ? "Edit Applicant" : "Add Applicant"}
          </DialogTitle>
          <DialogDescription>
            Applicant records are reusable — one person can apply to several
            vacancies.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Last Name *</Label>
            <Input
              value={form.last_name}
              onChange={(e) => set("last_name")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>First Name *</Label>
            <Input
              value={form.first_name}
              onChange={(e) => set("first_name")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Middle Name</Label>
            <Input
              value={form.middle_name}
              onChange={(e) => set("middle_name")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Name Extension</Label>
            <Input
              value={form.name_extension}
              onChange={(e) => set("name_extension")(e.target.value)}
              placeholder="Jr., III"
            />
          </div>
          <div className="space-y-2">
            <Label>Sex</Label>
            <Select
              value={form.sex}
              items={SEX_OPTIONS}
              onValueChange={(v) => set("sex")(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {SEX_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} label={o.label}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Birth Date</Label>
            <Input
              type="date"
              value={form.birth_date}
              onChange={(e) => set("birth_date")(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Address</Label>
            <Input
              value={form.address}
              onChange={(e) => set("address")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Mobile No.</Label>
            <Input
              value={form.mobile_no}
              onChange={(e) => set("mobile_no")(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
            />
          </div>
        </div>
        {!applicant && duplicates.length > 0 && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium">
              <TriangleAlert className="h-4 w-4 text-amber-600" />
              Similar applicant{duplicates.length > 1 ? "s" : ""} already on
              record:
            </p>
            <ul className="mt-1 list-disc pl-6 text-muted-foreground">
              {duplicates.map((d) => (
                <li key={d.id}>
                  {formatApplicantName(d)}
                  {d.birth_date ? ` — born ${d.birth_date}` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-muted-foreground">
              If this is the same person, close this dialog and use the
              existing record instead.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              loading || !form.last_name.trim() || !form.first_name.trim()
            }
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {applicant ? "Save Changes" : "Add Applicant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

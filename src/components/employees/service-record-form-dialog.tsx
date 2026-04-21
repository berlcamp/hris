"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
} from "@/components/ui/dialog";
import {
  createServiceRecord,
  updateServiceRecord,
} from "@/lib/actions/service-record-actions";
import type { ServiceRecord } from "@/lib/types";

interface ServiceRecordFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  record?: ServiceRecord | null;
}

interface FormState {
  date_from: string;
  date_to: string;
  designation: string;
  status_type: string;
  salary: string;
  salary_grade: string;
  step_increment: string;
  office: string;
  branch: string;
  agency: string;
  leave_without_pay: string;
  daily_salary: string;
  separation_date: string;
  separation_cause: string;
  remarks: string;
}

function initialForm(record: ServiceRecord | null | undefined): FormState {
  if (!record) {
    return {
      date_from: "",
      date_to: "",
      designation: "",
      status_type: "",
      salary: "",
      salary_grade: "",
      step_increment: "",
      office: "",
      branch: "",
      agency: "",
      leave_without_pay: "0",
      daily_salary: "",
      separation_date: "",
      separation_cause: "",
      remarks: "",
    };
  }
  return {
    date_from: record.date_from ?? "",
    date_to: record.date_to ?? "",
    designation: record.designation ?? "",
    status_type: record.status_type ?? "",
    salary: record.salary != null ? String(record.salary) : "",
    salary_grade:
      record.salary_grade != null ? String(record.salary_grade) : "",
    step_increment:
      record.step_increment != null ? String(record.step_increment) : "",
    office: record.office ?? "",
    branch: record.branch ?? "",
    agency: record.agency ?? "",
    leave_without_pay: String(record.leave_without_pay ?? 0),
    daily_salary:
      record.daily_salary != null ? String(record.daily_salary) : "",
    separation_date: record.separation_date ?? "",
    separation_cause: record.separation_cause ?? "",
    remarks: record.remarks ?? "",
  };
}

interface ServiceRecordFormBodyProps {
  employeeId: string;
  employeeName: string;
  record: ServiceRecord | null | undefined;
  onClose: () => void;
}

function ServiceRecordFormBody({
  employeeId,
  employeeName,
  record,
  onClose,
}: ServiceRecordFormBodyProps) {
  const router = useRouter();
  const isEdit = Boolean(record);
  const [form, setForm] = useState<FormState>(() => initialForm(record));
  const [loading, setLoading] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.date_from || !form.designation.trim()) {
      toast.error("Date from and designation are required.");
      return;
    }
    if (form.date_to && new Date(form.date_to) < new Date(form.date_from)) {
      toast.error("Date to must be on or after date from.");
      return;
    }

    setLoading(true);
    const payload = {
      date_from: form.date_from,
      date_to: form.date_to || null,
      designation: form.designation.trim(),
      status_type: form.status_type || null,
      salary: form.salary || null,
      salary_grade: form.salary_grade || null,
      step_increment: form.step_increment || null,
      office: form.office || null,
      branch: form.branch || null,
      agency: form.agency || null,
      leave_without_pay: form.leave_without_pay || "0",
      daily_salary: form.daily_salary || null,
      separation_date: form.separation_date || null,
      separation_cause: form.separation_cause || null,
      remarks: form.remarks || null,
    };

    const result =
      isEdit && record
        ? await updateServiceRecord(record.id, payload)
        : await createServiceRecord(employeeId, payload);

    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success(
        isEdit
          ? "Service record updated successfully."
          : "Service record added successfully."
      );
      onClose();
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Edit Service Record" : "Add Service Record"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? `Update service record for ${employeeName}.`
            : `Add a new service record entry for ${employeeName}.`}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-1">
        <div className="space-y-2">
          <Label>Date From *</Label>
          <Input
            type="date"
            value={form.date_from}
            onChange={(e) => update("date_from", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Date To</Label>
          <Input
            type="date"
            value={form.date_to}
            onChange={(e) => update("date_to", e.target.value)}
            placeholder="Leave blank if present"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Designation *</Label>
          <Input
            value={form.designation}
            onChange={(e) => update("designation", e.target.value)}
            placeholder="e.g. Administrative Officer III"
          />
        </div>

        <div className="space-y-2">
          <Label>Status / Appointment</Label>
          <Input
            value={form.status_type}
            onChange={(e) => update("status_type", e.target.value)}
            placeholder="Plantilla / JO / COS"
          />
        </div>
        <div className="space-y-2">
          <Label>Office / Department</Label>
          <Input
            value={form.office}
            onChange={(e) => update("office", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Salary Grade</Label>
          <Input
            type="number"
            min={1}
            max={33}
            value={form.salary_grade}
            onChange={(e) => update("salary_grade", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Step</Label>
          <Input
            type="number"
            min={1}
            max={8}
            value={form.step_increment}
            onChange={(e) => update("step_increment", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Monthly Salary (₱)</Label>
          <Input
            type="number"
            step="0.01"
            value={form.salary}
            onChange={(e) => update("salary", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Daily Salary (₱)</Label>
          <Input
            type="number"
            step="0.01"
            value={form.daily_salary}
            onChange={(e) => update("daily_salary", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Branch</Label>
          <Input
            value={form.branch}
            onChange={(e) => update("branch", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Agency</Label>
          <Input
            value={form.agency}
            onChange={(e) => update("agency", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Leave w/o Pay (days)</Label>
          <Input
            type="number"
            min={0}
            value={form.leave_without_pay}
            onChange={(e) => update("leave_without_pay", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Separation Date</Label>
          <Input
            type="date"
            value={form.separation_date}
            onChange={(e) => update("separation_date", e.target.value)}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Separation Cause</Label>
          <Input
            value={form.separation_cause}
            onChange={(e) => update("separation_cause", e.target.value)}
            placeholder="e.g. Promotion, Transfer, Resignation"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Remarks</Label>
          <Textarea
            rows={3}
            value={form.remarks}
            onChange={(e) => update("remarks", e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? "Save Changes" : "Add Record"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function ServiceRecordFormDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  record,
}: ServiceRecordFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ServiceRecordFormBody
          key={record?.id ?? "new"}
          employeeId={employeeId}
          employeeName={employeeName}
          record={record}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

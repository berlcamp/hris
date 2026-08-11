"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { DialogFooter } from "@/components/ui/dialog";
import {
  jobOrderEmployeeSchema,
  type JobOrderEmployeeValues,
} from "@/lib/validations/job-order-schema";
import {
  createJobOrderEmployee,
  updateJobOrderEmployee,
} from "@/lib/actions/job-order-actions";
import type { JobOrderArea } from "@/lib/types";

interface JobOrderFormProps {
  areas: JobOrderArea[];
  defaultValues?: JobOrderEmployeeValues & { id?: string };
  mode: "create" | "edit";
  onSuccess: () => void;
  onCancel: () => void;
}

const blankDefaults: JobOrderEmployeeValues = {
  full_name: "",
  sex: null,
  purok: "",
  barangay: "",
  area_id: "",
  sub_area: "",
  daily_rate: null,
  working_hours: "",
  date_started: "",
  eligibility: "",
  recommended_by: "",
  remarks: "",
  remarks_2: "",
  has_atm: false,
  landbank_account_number: "",
  sss_no: "",
  sss_ss: null,
  sss_ec: null,
  community_tax_number: "",
  community_tax_date: "",
  community_tax_place_issued: "",
  status: "active",
};

export function JobOrderForm({
  areas,
  defaultValues,
  mode,
  onSuccess,
  onCancel,
}: JobOrderFormProps) {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<JobOrderEmployeeValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(jobOrderEmployeeSchema) as any,
    defaultValues: defaultValues ?? blankDefaults,
  });

  const hasAtm = watch("has_atm");
  const areaId = watch("area_id");
  const sex = watch("sex");
  const status = watch("status");

  // An inactive area must not be offered to a NEW record, but an existing
  // record's own area stays listed even after it goes inactive — otherwise
  // the form could never be saved again and the record becomes uneditable.
  const selectableAreas = areas.filter(
    (a) => a.is_active || a.id === defaultValues?.area_id,
  );

  // The trigger renders the raw value unless the label is declared here, so a
  // selected area would otherwise read as its UUID.
  const areaItems = selectableAreas.map((a) => ({
    value: a.id,
    label: a.is_active ? a.name : `${a.name} (Inactive)`,
  }));

  const onSubmit = async (data: JobOrderEmployeeValues) => {
    setLoading(true);
    const result =
      mode === "create"
        ? await createJobOrderEmployee(data)
        : await updateJobOrderEmployee(defaultValues!.id!, data);
    setLoading(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(
      mode === "create"
        ? "Job Order employee created."
        : "Job Order employee updated.",
    );
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Name, sex, and residential address.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name *</Label>
            <Input
              id="full_name"
              placeholder="Dela Cruz, Juan"
              {...register("full_name")}
              aria-invalid={!!errors.full_name}
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">
                {errors.full_name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Sex</Label>
            <Select
              value={sex ?? "none"}
              items={[
                { value: "none", label: "Not specified" },
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
              ]}
              onValueChange={(val) =>
                setValue(
                  "sex",
                  val === "none" ? null : (val as "male" | "female"),
                  { shouldValidate: true },
                )
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select sex" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not specified</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="purok">Purok</Label>
              <Input id="purok" {...register("purok")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="barangay">Barangay</Label>
              <Input id="barangay" {...register("barangay")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Employment Information */}
      <Card>
        <CardHeader>
          <CardTitle>Employment Information</CardTitle>
          <CardDescription>
            Area assignment, rate, and engagement details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Area Assignment *</Label>
              <Select
                value={areaId || undefined}
                items={areaItems}
                onValueChange={(val) =>
                  setValue("area_id", val ?? "", { shouldValidate: true })
                }
              >
                <SelectTrigger className="w-full" aria-invalid={!!errors.area_id}>
                  <SelectValue placeholder="Select area" />
                </SelectTrigger>
                <SelectContent>
                  {areaItems.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.area_id && (
                <p className="text-sm text-destructive">
                  {errors.area_id.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub_area">Sub-Area</Label>
              <Input id="sub_area" {...register("sub_area")} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="daily_rate">Daily Rate</Label>
              <Input
                id="daily_rate"
                type="number"
                step="0.01"
                min={0}
                {...register("daily_rate")}
                aria-invalid={!!errors.daily_rate}
              />
              {errors.daily_rate && (
                <p className="text-sm text-destructive">
                  {errors.daily_rate.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="working_hours">Working Hours</Label>
              <Input
                id="working_hours"
                placeholder="e.g. 7:00 PM - 7:00 AM"
                {...register("working_hours")}
                aria-invalid={!!errors.working_hours}
              />
              {errors.working_hours && (
                <p className="text-sm text-destructive">
                  {errors.working_hours.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date_started">Date Started</Label>
              <Input id="date_started" type="date" {...register("date_started")} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                items={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                onValueChange={(val) =>
                  setValue("status", val as "active" | "inactive", {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="eligibility">Eligibility</Label>
              <Input id="eligibility" {...register("eligibility")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recommended_by">Recommended By</Label>
              <Input id="recommended_by" {...register("recommended_by")} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea id="remarks" rows={2} {...register("remarks")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="remarks_2">Remarks 2</Label>
              <Textarea id="remarks_2" rows={2} {...register("remarks_2")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bank Information */}
      <Card>
        <CardHeader>
          <CardTitle>Bank Information</CardTitle>
          <CardDescription>
            SSS numbers and LandBank ATM payout details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="sss_no">SSS No.</Label>
              <Input id="sss_no" {...register("sss_no")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sss_ss">SSS (SS)</Label>
              <Input
                id="sss_ss"
                type="number"
                step="0.01"
                min={0}
                {...register("sss_ss")}
                aria-invalid={!!errors.sss_ss}
              />
              {errors.sss_ss && (
                <p className="text-sm text-destructive">
                  {errors.sss_ss.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sss_ec">SSS (EC)</Label>
              <Input
                id="sss_ec"
                type="number"
                step="0.01"
                min={0}
                {...register("sss_ec")}
                aria-invalid={!!errors.sss_ec}
              />
              {errors.sss_ec && (
                <p className="text-sm text-destructive">
                  {errors.sss_ec.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Has ATM</p>
              <p className="text-xs text-muted-foreground">
                Whether pay is credited to a LandBank ATM account.
              </p>
            </div>
            <Switch
              checked={hasAtm}
              onCheckedChange={(checked) => {
                setValue("has_atm", !!checked, { shouldValidate: true });
                // The DB's chk_job_order_atm_account CHECK constraint rejects
                // a row that has an account number but Has ATM = No, so the
                // stale value must be cleared here, not just hidden below.
                if (!checked) {
                  setValue("landbank_account_number", "", {
                    shouldValidate: true,
                  });
                }
              }}
            />
          </div>

          {hasAtm && (
            <div className="space-y-2">
              <Label htmlFor="landbank_account_number">
                LandBank Account Number *
              </Label>
              <Input
                id="landbank_account_number"
                {...register("landbank_account_number")}
                aria-invalid={!!errors.landbank_account_number}
              />
              {errors.landbank_account_number && (
                <p className="text-sm text-destructive">
                  {errors.landbank_account_number.message}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Community Tax Certificate */}
      <Card>
        <CardHeader>
          <CardTitle>Community Tax Certificate</CardTitle>
          <CardDescription>Cedula details, if on file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="community_tax_number">CTC Number</Label>
              <Input
                id="community_tax_number"
                {...register("community_tax_number")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="community_tax_date">Date Issued</Label>
              <Input
                id="community_tax_date"
                type="date"
                {...register("community_tax_date")}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="community_tax_place_issued">Place Issued</Label>
            <Input
              id="community_tax_place_issued"
              {...register("community_tax_place_issued")}
            />
          </div>
        </CardContent>
      </Card>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create Employee" : "Save Changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

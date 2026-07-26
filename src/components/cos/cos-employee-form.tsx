"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
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
  createCosEmployee,
  updateCosEmployee,
  type CosEmployeeWithDepartment,
} from "@/lib/actions/cos-employee-actions";
import {
  cosEmployeeFormSchema,
  type CosEmployeeFormValues,
} from "@/lib/validations/cos-employee-schema";
import {
  COS_EMPLOYEE_STATUSES,
  COS_EMPLOYEE_STATUS_LABELS,
  COS_SEXES,
  COS_SEX_LABELS,
} from "@/lib/cos-constants";

const NONE = "none";

interface CosEmployeeFormProps {
  mode: "create" | "edit";
  departments: { id: string; name: string }[];
  employee?: CosEmployeeWithDepartment;
}

export function CosEmployeeForm({
  mode,
  departments,
  employee,
}: CosEmployeeFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = useForm<CosEmployeeFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(cosEmployeeFormSchema) as any,
    defaultValues: {
      cos_no: employee?.cos_no ?? "",
      first_name: employee?.first_name ?? "",
      middle_name: employee?.middle_name ?? null,
      last_name: employee?.last_name ?? "",
      suffix: employee?.suffix ?? null,
      sex: employee?.sex ?? null,
      birth_date: employee?.birth_date ?? null,
      address: employee?.address ?? null,
      contact_number: employee?.contact_number ?? null,
      email: employee?.email ?? null,
      department_id: employee?.department_id ?? null,
      position_title: employee?.position_title ?? null,
      eligibility: employee?.eligibility ?? null,
      recommended_by: employee?.recommended_by ?? null,
      remarks: employee?.remarks ?? null,
      status: employee?.status ?? "active",
    },
  });

  const watchSex = watch("sex");
  const watchDepartment = watch("department_id");
  const watchStatus = watch("status");

  const onSubmit = async (values: CosEmployeeFormValues) => {
    setLoading(true);
    const result =
      mode === "create"
        ? await createCosEmployee(values)
        : await updateCosEmployee(employee!.id, values);
    setLoading(false);

    if ("error" in result) {
      // A duplicate cos_no is a field problem, not a page-level failure.
      // `field` narrowing via `in` (not direct property access) because the
      // action's inferred return type only puts `field` on the duplicate-
      // cos_no branch, not on every `{ error: string }` shape it can return.
      if ("field" in result && result.field === "cos_no") {
        setError("cos_no", { message: result.error });
      }
      toast.error(result.error);
      return;
    }

    toast.success(
      mode === "create" ? "COS employee created" : "COS employee updated",
    );
    router.push(`/cos/employees/${result.data.id}`);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="cos_no">COS No.</Label>
            <Input id="cos_no" {...register("cos_no")} />
            {errors.cos_no && (
              <p className="text-sm text-destructive">{errors.cos_no.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="first_name">First Name</Label>
            <Input id="first_name" {...register("first_name")} />
            {errors.first_name && (
              <p className="text-sm text-destructive">
                {errors.first_name.message}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="middle_name">Middle Name</Label>
            <Input id="middle_name" {...register("middle_name")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="last_name">Last Name</Label>
            <Input id="last_name" {...register("last_name")} />
            {errors.last_name && (
              <p className="text-sm text-destructive">
                {errors.last_name.message}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="suffix">Suffix</Label>
            <Input id="suffix" placeholder="Jr., III" {...register("suffix")} />
          </div>
          <div className="grid gap-2">
            <Label>Sex</Label>
            <Select
              value={watchSex ?? NONE}
              onValueChange={(v) =>
                setValue("sex", v === NONE ? null : (v as (typeof COS_SEXES)[number]), {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select sex" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not specified</SelectItem>
                {COS_SEXES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {COS_SEX_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="birth_date">Birthdate</Label>
            <Input id="birth_date" type="date" {...register("birth_date")} />
            {errors.birth_date && (
              <p className="text-sm text-destructive">
                {errors.birth_date.message}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact_number">Contact Number</Label>
            <Input id="contact_number" {...register("contact_number")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" rows={2} {...register("address")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employment Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Office / Department</Label>
            <Select
              value={watchDepartment ?? NONE}
              onValueChange={(v) =>
                setValue("department_id", v === NONE ? null : v, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="position_title">Position</Label>
            <Input id="position_title" {...register("position_title")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="eligibility">Eligibility</Label>
            <Input id="eligibility" {...register("eligibility")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="recommended_by">Recommended By</Label>
            <Input id="recommended_by" {...register("recommended_by")} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea id="remarks" rows={3} {...register("remarks")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:max-w-xs">
            <Label>Status</Label>
            <Select
              value={watchStatus}
              onValueChange={(v) =>
                setValue("status", v as (typeof COS_EMPLOYEE_STATUSES)[number], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COS_EMPLOYEE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {COS_EMPLOYEE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Inactive employees cannot be issued new contracts.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create COS Employee" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CosRichTextEditor } from "@/components/cos/cos-rich-text-editor";
import {
  createCosContract,
  updateCosContract,
  renewCosContract,
  type CosContractWithEmployee,
} from "@/lib/actions/cos-contract-actions";
import { getCosContractTemplate } from "@/lib/actions/cos-contract-template-actions";
import {
  cosContractFormSchema,
  type CosContractFormValues,
} from "@/lib/validations/cos-contract-schema";
import {
  asFormBody,
  EMPTY_CONTRACT_DOC,
  isContractDocEmpty,
  type TiptapNode,
} from "@/lib/cos-contract-doc";
import { formatCosEmployeeName } from "@/lib/cos-constants";

const NONE = "none";

export interface ContractFormEmployee {
  id: string;
  cos_no: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  position_title: string | null;
  monthly_rate: number | null;
}

interface CosContractFormProps {
  mode: "create" | "edit" | "renew";
  /** Active employees only — an inactive one cannot receive a new contract. */
  employees: ContractFormEmployee[];
  templates: { id: string; name: string }[];
  /** The row being edited (edit) or renewed (renew). */
  contract?: CosContractWithEmployee;
  /** Prefill for create/duplicate. Ignored in edit and renew. */
  defaults?: Partial<CosContractFormValues>;
}

export function CosContractForm({
  mode,
  employees,
  templates,
  contract,
  defaults,
}: CosContractFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Holds a template whose body would overwrite existing work, pending confirm.
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = useForm<CosContractFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(cosContractFormSchema) as any,
    defaultValues: {
      cos_employee_id:
        contract?.cos_employee_id ?? defaults?.cos_employee_id ?? "",
      // Period is never prefilled on renew or duplicate: reusing the source
      // period would be rejected by the exclusion constraint every time.
      period_start: mode === "edit" ? contract!.period_start : "",
      period_end: mode === "edit" ? contract!.period_end : "",
      monthly_rate: contract?.monthly_rate ?? defaults?.monthly_rate ?? null,
      position_title:
        contract?.position_title ?? defaults?.position_title ?? null,
      scope_of_work: contract?.scope_of_work ?? defaults?.scope_of_work ?? null,
      signatory_name:
        contract?.signatory_name ?? defaults?.signatory_name ?? null,
      signatory_position:
        contract?.signatory_position ?? defaults?.signatory_position ?? null,
      witness_name: contract?.witness_name ?? defaults?.witness_name ?? null,
      witness_position:
        contract?.witness_position ?? defaults?.witness_position ?? null,
      template_id: contract?.template_id ?? defaults?.template_id ?? null,
      // contract?.body / EMPTY_CONTRACT_DOC are TiptapNode (type: string);
      // defaults?.body is already form-typed (ContractBody, "doc" literal) —
      // asFormBody only bridges the TiptapNode arms. `contract` and `defaults`
      // are never both populated (defaults is "Ignored in edit and renew",
      // the only modes that set `contract` — see the prop doc comment above),
      // so reordering the fallback to keep the two typed arms apart doesn't
      // change behavior.
      body: defaults?.body ?? asFormBody(contract?.body ?? EMPTY_CONTRACT_DOC),
    },
  });

  const watchEmployee = watch("cos_employee_id");
  const watchTemplate = watch("template_id");
  const watchBody = watch("body") as TiptapNode;

  const employeeLocked = mode !== "create";

  /** Prefills position and rate from the registry; both stay editable. */
  const onEmployeeChange = (id: string) => {
    setValue("cos_employee_id", id, { shouldValidate: true });
    const emp = employees.find((e) => e.id === id);
    if (!emp) return;
    setValue("position_title", emp.position_title, { shouldValidate: true });
    setValue("monthly_rate", emp.monthly_rate, { shouldValidate: true });
  };

  const applyTemplate = async (id: string) => {
    setValue("template_id", id, { shouldValidate: true });
    const template = await getCosContractTemplate(id);
    if (!template) {
      toast.error("That template could not be loaded");
      return;
    }
    setValue("body", asFormBody(template.body), {
      shouldValidate: true,
    });
  };

  const onTemplateChange = (value: string | null) => {
    // base-ui's Select types onValueChange as (string | null) for a
    // single-select even when every item's value is a string.
    if (!value || value === NONE) {
      setValue("template_id", null, { shouldValidate: true });
      return;
    }
    // Replacing a body the user has already written is destructive — confirm.
    // isContractDocEmpty lives beside EMPTY_CONTRACT_DOC on purpose: a local
    // copy of this test drifted from that constant once already and warned
    // about discarding work on every blank new contract.
    if (!isContractDocEmpty(watchBody)) {
      setPendingTemplateId(value);
      return;
    }
    void applyTemplate(value);
  };

  const onSubmit = async (values: CosContractFormValues) => {
    setLoading(true);
    const result =
      mode === "create"
        ? await createCosContract(values)
        : mode === "renew"
          ? await renewCosContract(contract!.id, values)
          : await updateCosContract(contract!.id, values);
    setLoading(false);

    if ("error" in result) {
      if ("field" in result && result.field) {
        setError(result.field as keyof CosContractFormValues, {
          message: result.error,
        });
      }
      toast.error(result.error);
      return;
    }

    toast.success(
      mode === "renew"
        ? "Contract renewed"
        : mode === "create"
          ? "Contract created"
          : "Contract updated",
    );
    router.push(`/cos/contracts/${result.data.id}`);
    router.refresh();
  };

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Employee &amp; Period</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>COS Employee</Label>
              <Select
                value={watchEmployee || NONE}
                disabled={employeeLocked}
                items={[
                  { value: NONE, label: "Select an employee" },
                  ...employees.map((e) => ({
                    value: e.id,
                    label: `${formatCosEmployeeName(e)} (${e.cos_no})`,
                  })),
                ]}
                onValueChange={(v) => {
                  // base-ui's Select types onValueChange as (string | null) for
                  // a single-select even when every item's value is a string.
                  if (v && v !== NONE) onEmployeeChange(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {formatCosEmployeeName(e)} ({e.cos_no})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {employeeLocked && (
                <p className="text-sm text-muted-foreground">
                  The employee is fixed once a contract exists.
                </p>
              )}
              {errors.cos_employee_id && (
                <p className="text-sm text-destructive">
                  {errors.cos_employee_id.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="period_start">Start Date</Label>
              <Input id="period_start" type="date" {...register("period_start")} />
              {errors.period_start && (
                <p className="text-sm text-destructive">
                  {errors.period_start.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="period_end">End Date</Label>
              <Input id="period_end" type="date" {...register("period_end")} />
              {errors.period_end && (
                <p className="text-sm text-destructive">
                  {errors.period_end.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Terms</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="position_title">Position</Label>
              <Input id="position_title" {...register("position_title")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="monthly_rate">Monthly Rate</Label>
              <Input
                id="monthly_rate"
                type="number"
                step="0.01"
                min="0"
                {...register("monthly_rate")}
              />
              {errors.monthly_rate && (
                <p className="text-sm text-destructive">
                  {errors.monthly_rate.message}
                </p>
              )}
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="scope_of_work">Scope of Work</Label>
              <Textarea id="scope_of_work" rows={3} {...register("scope_of_work")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signatories</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="signatory_name">Signatory Name</Label>
              <Input id="signatory_name" {...register("signatory_name")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="signatory_position">Signatory Position</Label>
              <Input id="signatory_position" {...register("signatory_position")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="witness_name">Witness Name</Label>
              <Input id="witness_name" {...register("witness_name")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="witness_position">Witness Position</Label>
              <Input id="witness_position" {...register("witness_position")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contract Body</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2 sm:max-w-sm">
              <Label>Start from a template</Label>
              <Select
                value={watchTemplate ?? NONE}
                items={[
                  { value: NONE, label: "No template" },
                  ...templates.map((t) => ({ value: t.id, label: t.name })),
                ]}
                onValueChange={onTemplateChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No template</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                The template body is copied here. Editing the template later
                will not change this contract.
              </p>
            </div>
            <CosRichTextEditor
              value={watchBody}
              onChange={(doc) =>
                setValue("body", asFormBody(doc), { shouldValidate: true })
              }
            />
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "renew"
              ? "Create Renewal"
              : mode === "create"
                ? "Create Contract"
                : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>

      <AlertDialog
        open={pendingTemplateId !== null}
        onOpenChange={(open) => !open && setPendingTemplateId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the contract body?</AlertDialogTitle>
            <AlertDialogDescription>
              This contract already has a body. Loading this template will
              discard what is currently written.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep what I have</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = pendingTemplateId;
                setPendingTemplateId(null);
                if (id) void applyTemplate(id);
              }}
            >
              Replace it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

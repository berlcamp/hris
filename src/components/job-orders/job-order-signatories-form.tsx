"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import { updateJobOrderSignatories } from "@/lib/actions/job-order-signatory-actions";
import {
  JOB_ORDER_SIGNATORY_GROUPS,
  JOB_ORDER_SIGNATORY_KEYS,
  type JobOrderSignatories,
} from "@/lib/job-order-signatories";
import {
  jobOrderSignatoriesSchema,
  type JobOrderSignatoriesValues,
} from "@/lib/validations/job-order-signatory-schema";

function toFormValues(s: JobOrderSignatories): JobOrderSignatoriesValues {
  return Object.fromEntries(
    JOB_ORDER_SIGNATORY_KEYS.map((key) => [
      key,
      { name: s[key].name, position: s[key].position, office: s[key].office ?? "" },
    ]),
  ) as JobOrderSignatoriesValues;
}

/**
 * Every signatory the Job Order printables carry, grouped by document, saved
 * together. A print picks the saved values up the next time it runs.
 */
export function JobOrderSignatoriesForm({
  signatories,
}: {
  signatories: JobOrderSignatories;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<JobOrderSignatoriesValues>({
    resolver: zodResolver(jobOrderSignatoriesSchema),
    defaultValues: toFormValues(signatories),
  });

  const onSubmit = async (values: JobOrderSignatoriesValues) => {
    try {
      const result = await updateJobOrderSignatories(values);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Signatories saved");
      reset(values);
      router.refresh();
    } catch {
      toast.error("Could not save the signatories. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
      {JOB_ORDER_SIGNATORY_GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle className="text-base">{group.title}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {group.slots.map((slot, i) => {
              const slotErrors = errors[slot.key];
              return (
                <div key={slot.key} className="space-y-3">
                  {i > 0 && <Separator />}
                  <div>
                    <p className="text-sm font-medium">{slot.label}</p>
                    <p className="text-muted-foreground text-xs">{slot.usedOn}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`${slot.key}-name`}>Name</Label>
                      <Input
                        id={`${slot.key}-name`}
                        {...register(`${slot.key}.name`)}
                        aria-invalid={!!slotErrors?.name}
                      />
                      {slotErrors?.name && (
                        <p className="text-destructive text-sm">
                          {slotErrors.name.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${slot.key}-position`}>Position</Label>
                      <Input
                        id={`${slot.key}-position`}
                        {...register(`${slot.key}.position`)}
                        aria-invalid={!!slotErrors?.position}
                      />
                      {slotErrors?.position && (
                        <p className="text-destructive text-sm">
                          {slotErrors.position.message}
                        </p>
                      )}
                    </div>
                    {slot.hasOffice && (
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`${slot.key}-office`}>
                          Office{" "}
                          <span className="text-muted-foreground font-normal">
                            (optional)
                          </span>
                        </Label>
                        <Input
                          id={`${slot.key}-office`}
                          {...register(`${slot.key}.office`)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty || isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save signatories
        </Button>
      </div>
    </form>
  );
}

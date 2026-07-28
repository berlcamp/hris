"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Ban } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { terminateCosContract } from "@/lib/actions/cos-contract-actions";
import {
  cosContractTerminationSchema,
  type CosContractTerminationValues,
} from "@/lib/validations/cos-contract-schema";

interface CosContractTerminateDialogProps {
  contractId: string;
  /** Bounds the date input: a termination must fall inside the period. */
  periodStart: string;
  periodEnd: string;
}

export function CosContractTerminateDialog({
  contractId,
  periodStart,
  periodEnd,
}: CosContractTerminateDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<CosContractTerminationValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(cosContractTerminationSchema) as any,
    defaultValues: { terminated_on: "", termination_reason: "" },
  });

  const onSubmit = async (values: CosContractTerminationValues) => {
    setLoading(true);
    const result = await terminateCosContract(contractId, values);
    setLoading(false);

    if ("error" in result) {
      if ("field" in result && result.field) {
        setError(result.field as keyof CosContractTerminationValues, {
          message: result.error,
        });
      }
      toast.error(result.error);
      return;
    }

    toast.success("Contract terminated");
    setOpen(false);
    reset();
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Ban className="h-4 w-4" />
        Terminate
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terminate this contract?</DialogTitle>
          <DialogDescription>
            The contract is marked terminated as of the date below and can no
            longer be renewed. This cannot be undone from here.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="terminated_on">Termination Date</Label>
            <Input
              id="terminated_on"
              type="date"
              min={periodStart}
              max={periodEnd}
              {...register("terminated_on")}
            />
            {errors.terminated_on && (
              <p className="text-sm text-destructive">
                {errors.terminated_on.message}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="termination_reason">Reason</Label>
            <Textarea
              id="termination_reason"
              rows={3}
              {...register("termination_reason")}
            />
            {errors.termination_reason && (
              <p className="text-sm text-destructive">
                {errors.termination_reason.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Terminate Contract
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

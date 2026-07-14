"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { screenApplication } from "@/lib/actions/rsp-actions";
import { screeningSchema } from "@/lib/validations/rsp-schema";

interface ScreeningDialogProps {
  applicationId: string;
  applicantName: string;
  trigger: React.ReactElement;
}

export function ScreeningDialog({
  applicationId,
  applicantName,
  trigger,
}: ScreeningDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"qualified" | "disqualified" | "">("");
  const [remarks, setRemarks] = useState("");

  const handleSubmit = async () => {
    const parsed = screeningSchema.safeParse({ result, remarks });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    const res = await screenApplication(applicationId, parsed.data);
    if ("error" in res && res.error) toast.error(res.error);
    else {
      toast.success(
        parsed.data.result === "qualified"
          ? "Marked as qualified — the candidate proceeds to HRMPSB assessment."
          : "Marked as disqualified."
      );
      setOpen(false);
      setResult("");
      setRemarks("");
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Screen Application — {applicantName}</DialogTitle>
          <DialogDescription>
            Initial evaluation against the Qualification Standards (education,
            training, experience, eligibility).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup
            value={result}
            onValueChange={(v) =>
              setResult((v as "qualified" | "disqualified") ?? "")
            }
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="qualified" id="screen-qualified" />
              <Label htmlFor="screen-qualified">
                Qualified — meets the minimum QS
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="disqualified" id="screen-disqualified" />
              <Label htmlFor="screen-disqualified">
                Disqualified — does not meet the QS
              </Label>
            </div>
          </RadioGroup>
          <div className="space-y-2">
            <Label>
              Remarks{result === "disqualified" ? " * (state the QS not met)" : ""}
            </Label>
            <Textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={
                result === "disqualified"
                  ? "e.g. Lacks the required CS Professional eligibility"
                  : "Optional"
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !result}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Screening Result
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

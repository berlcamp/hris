"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { voidCtoCredit } from "@/lib/actions/cto-actions";

interface CtoVoidCreditDialogProps {
  creditId: string;
  description: string;
}

export function CtoVoidCreditDialog({ creditId, description }: CtoVoidCreditDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");

  const handleSubmit = async () => {
    setLoading(true);
    const result = await voidCtoCredit(creditId, reason.trim());
    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success("COC entry voided.");
      setOpen(false);
      setReason("");
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" title="Void this COC entry" />
        }
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void COC Entry</DialogTitle>
          <DialogDescription>
            Void {description}. The entry stays on record for audit but stops
            counting toward the balance. Entries already consumed by approved
            CTO applications cannot be voided. To correct a mistake, void the
            entry and re-encode it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Encoding error — wrong hours"
            rows={2}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Void Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

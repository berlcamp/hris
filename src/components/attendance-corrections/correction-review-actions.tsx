"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  approveCorrectionRequest,
  cancelCorrectionRequest,
  rejectCorrectionRequest,
} from "@/lib/actions/attendance-correction-actions";

export function CorrectionReviewActions({
  requestId,
  status,
  canReview,
  canWithdraw,
  totalLateForgiven,
  totalUndertimeForgiven,
  dayCount,
}: {
  requestId: string;
  status: string;
  canReview: boolean;
  canWithdraw: boolean;
  totalLateForgiven: number;
  totalUndertimeForgiven: number;
  dayCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [notes, setNotes] = useState("");

  // Only a live request can be acted on. The server re-checks this — the guard
  // here just avoids showing buttons that would always fail.
  const isLive = status === "pending" || status === "needs_rebase";
  if (!isLive || (!canReview && !canWithdraw)) return null;

  const handleApprove = async () => {
    setLoading(true);
    try {
      const { outcome } = await approveCorrectionRequest(requestId);
      if (outcome === "applied") {
        toast.success("Correction applied. The DTR now reflects these days.");
      } else {
        // Drift, or a pinned schedule deleted since submit. Nothing was
        // written; the department has to re-base the request against the
        // attendance rows as they stand now.
        toast.warning(
          "The attendance for these days changed since this was filed. The request was sent back to the department to be updated.",
        );
      }
      setApproveOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not approve.");
    }
    setLoading(false);
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await rejectCorrectionRequest(requestId, notes);
      toast.success("Request rejected.");
      setRejectOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reject.");
    }
    setLoading(false);
  };

  const handleWithdraw = async () => {
    setLoading(true);
    try {
      await cancelCorrectionRequest(requestId);
      toast.success("Request withdrawn.");
      router.push("/attendance-corrections");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not withdraw.");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canReview && (
        <>
          <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
            <DialogTrigger render={<Button disabled={loading} />}>
              Approve
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Approve this correction</DialogTitle>
                <DialogDescription>
                  This rewrites {dayCount}{" "}
                  {dayCount === 1 ? "attendance day" : "attendance days"} and
                  waives <strong>{totalLateForgiven} minutes</strong> of
                  tardiness and{" "}
                  <strong>{totalUndertimeForgiven} minutes</strong> of
                  undertime. The corrected days are locked against later
                  biometric re-imports.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button onClick={handleApprove} disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Approve and apply
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <DialogTrigger
              render={<Button variant="destructive" disabled={loading} />}
            >
              Reject
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reject this correction</DialogTitle>
                <DialogDescription>
                  Say why. The department sees this note, and it is recorded in
                  the audit trail.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="reject-notes">Reason for rejection</Label>
                <Textarea
                  id="reject-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. The attached office order does not cover these dates"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setRejectOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={loading || !notes.trim()}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm rejection
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {canWithdraw && (
        <Button variant="outline" onClick={handleWithdraw} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Withdraw
        </Button>
      )}
    </div>
  );
}

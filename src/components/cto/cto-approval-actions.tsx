"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  approveCto,
  rejectCto,
  cancelCtoApplication,
  cancelApprovedCtoApplication,
} from "@/lib/actions/cto-actions";
import type { AuthUserData } from "@/lib/actions/auth-actions";
import { isDeptHead } from "@/lib/auth-helpers";

interface CtoApprovalActionsProps {
  ctoId: string;
  status: string;
  deptApprovedAt: string | null;
  canCancel: boolean;
  user: AuthUserData;
  /** When non-null, approval/reject buttons are only shown to this specific user (e.g. OCM Admin-created CTOs). */
  restrictToUserId?: string | null;
}

export function CtoApprovalActions({
  ctoId,
  status,
  deptApprovedAt,
  canCancel,
  user,
  restrictToUserId,
}: CtoApprovalActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelApprovedOpen, setCancelApprovedOpen] = useState(false);
  const [cancelApprovedReason, setCancelApprovedReason] = useState("");

  const handle = async (
    action: () => Promise<{ success?: boolean; error?: string; message?: string }>
  ) => {
    setLoading(true);
    const result = await action();
    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message ?? "Action completed successfully.");
      router.refresh();
    }
    setLoading(false);
  };

  // If the CTO was created by an OCM Admin, only that specific OCM Admin
  // user may see and act on the approval buttons.
  const isRestrictedApproval = !!restrictToUserId && user.id !== restrictToUserId;
  const isOwnRestricted = !!restrictToUserId && user.id === restrictToUserId;

  const canCancelApproved =
    status === "approved" &&
    (user.role === "super_admin" || user.role === "hr_admin" || isOwnRestricted);

  if (status === "approved") {
    if (isRestrictedApproval || !canCancelApproved) return null;
    return (
      <Dialog open={cancelApprovedOpen} onOpenChange={setCancelApprovedOpen}>
        <DialogTrigger
          render={<Button variant="destructive" disabled={loading} />}
        >
          Cancel Approved CTO
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Approved CTO</DialogTitle>
            <DialogDescription>
              This CTO has already been approved. Cancelling it will restore the
              consumed COC hours. Provide a reason for the cancellation — it
              will be recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Cancellation Reason</Label>
            <Textarea
              value={cancelApprovedReason}
              onChange={(e) => setCancelApprovedReason(e.target.value)}
              placeholder="e.g. Employee request — CTO no longer needed"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelApprovedOpen(false)}
            >
              Keep Approved
            </Button>
            <Button
              variant="destructive"
              disabled={loading || !cancelApprovedReason.trim()}
              onClick={() =>
                handle(async () => {
                  const r = await cancelApprovedCtoApplication(
                    ctoId,
                    cancelApprovedReason
                  );
                  setCancelApprovedOpen(false);
                  return r;
                })
              }
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Status stays "pending" through dept-head approval; only HR final approval
  // flips it to "approved".
  if (status !== "pending") return null;

  if (isRestrictedApproval) {
    // CTO was created by an OCM Admin — only that user may act on it.
    return canCancel ? (
      <Button
        variant="outline"
        onClick={() => handle(() => cancelCtoApplication(ctoId))}
        disabled={loading}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Cancel Application
      </Button>
    ) : null;
  }

  // OCM Admin approves at both stages sequentially: as Dept Head while the
  // dept-head approval is outstanding, then as HR once it's recorded.
  const isOcmAdmin = user.role === "ocm_admin";
  const canApproveAsDeptHead =
    (isDeptHead(user.role) || isOcmAdmin) && !deptApprovedAt;
  const hrCanAct =
    (user.role === "hr_admin" && !!deptApprovedAt) ||
    (isOcmAdmin && !!deptApprovedAt) ||
    user.role === "super_admin";

  return (
    <div className="flex gap-2 flex-wrap">
      {canApproveAsDeptHead && (
        <Button onClick={() => handle(() => approveCto(ctoId))} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Approve (Dept Head)
        </Button>
      )}

      {hrCanAct && (
        <Button onClick={() => handle(() => approveCto(ctoId))} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {deptApprovedAt ? "Final Approve (HR)" : "Approve (HR)"}
        </Button>
      )}

      {(isDeptHead(user.role) || hrCanAct || canApproveAsDeptHead) && (
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger
            render={<Button variant="destructive" disabled={loading} />}
          >
            Reject
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject CTO Application</DialogTitle>
              <DialogDescription>
                Provide a reason for rejecting this CTO application.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={loading || !rejectReason.trim()}
                onClick={() =>
                  handle(async () => {
                    const r = await rejectCto(ctoId, rejectReason);
                    setRejectOpen(false);
                    return r;
                  })
                }
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Rejection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canCancel && (
        <Button
          variant="outline"
          onClick={() => handle(() => cancelCtoApplication(ctoId))}
          disabled={loading}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Cancel Application
        </Button>
      )}
    </div>
  );
}

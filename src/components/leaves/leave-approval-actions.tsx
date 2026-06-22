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
import { Input } from "@/components/ui/input";
import {
  approveLeave,
  rejectLeave,
  cancelLeaveApplication,
  cancelApprovedLeaveApplication,
  overrideApprovedLeaveDaysWithPay,
} from "@/lib/actions/leave-actions";
import type { AuthUserData } from "@/lib/actions/auth-actions";
import { isDeptHead } from "@/lib/auth-helpers";

interface LeaveApprovalActionsProps {
  leaveId: string;
  status: string;
  deptApprovedAt: string | null;
  canCancel: boolean;
  user: AuthUserData;
  /** Required for the super-admin "Adjust Paid Days" dialog on approved leaves. */
  daysApplied?: number;
  daysWithPay?: number;
  /** Current credit balance for this leave's type (the view value, which
   *  already excludes this leave's `days_with_pay`). */
  creditBalance?: number;
  leaveTypeCode?: string | null;
  /** When non-null, approval/reject buttons are only shown to this specific user (e.g. OCM Admin-created leaves). */
  restrictToUserId?: string | null;
}

export function LeaveApprovalActions({
  leaveId,
  status,
  deptApprovedAt,
  canCancel,
  user,
  daysApplied,
  daysWithPay,
  creditBalance,
  leaveTypeCode,
  restrictToUserId,
}: LeaveApprovalActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelApprovedOpen, setCancelApprovedOpen] = useState(false);
  const [cancelApprovedReason, setCancelApprovedReason] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const handle = async (action: () => Promise<{ success?: boolean; error?: string; message?: string }>) => {
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

  // If the leave was created by an OCM Admin, only that specific OCM Admin
  // user may see and act on the approval buttons.
  const isRestrictedApproval = !!restrictToUserId && user.id !== restrictToUserId;

  // HR Admin / Super Admin can cancel an already-approved leave, with a
  // mandatory written reason. Credits are refunded automatically because the
  // balance view only counts approved rows. For OCM Admin-filed leaves the
  // approval/cancel rights are locked to that OCM Admin (restrictToUserId), so
  // the same OCM Admin — and only them — can also cancel the approved leave.
  const isOwnRestricted = !!restrictToUserId && user.id === restrictToUserId;
  const canCancelApproved =
    status === "approved" &&
    (user.role === "super_admin" || user.role === "hr_admin" || isOwnRestricted);

  // Super-admin-only: change the paid/LWOP split on an approved leave (e.g.
  // a leave originally recorded as LWOP because credits were unreconciled).
  const canOverridePaid =
    status === "approved" &&
    user.role === "super_admin" &&
    typeof daysApplied === "number" &&
    typeof daysWithPay === "number";

  const currentDaysApplied = Number(daysApplied ?? 0);
  const currentDaysWithPay = Number(daysWithPay ?? 0);
  const currentBalance = Number(creditBalance ?? 0);
  // The view already excludes this leave's contribution, so the maximum we can
  // re-allocate is the visible balance plus what's currently allocated.
  const maxPayable = Math.min(
    currentDaysApplied,
    currentBalance + currentDaysWithPay
  );

  const openOverride = () => {
    setOverrideValue(String(maxPayable));
    setOverrideReason("");
    setOverrideOpen(true);
  };

  if (status === "approved") {
    if (isRestrictedApproval || (!canCancelApproved && !canOverridePaid)) return null;
    return (
      <div className="flex gap-2 flex-wrap">
        {canOverridePaid && (
          <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
            <Button
              variant="outline"
              disabled={loading}
              onClick={openOverride}
            >
              Adjust Paid Days
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adjust Paid Days</DialogTitle>
                <DialogDescription>
                  Re-split this approved leave between paid days (charged to{" "}
                  {leaveTypeCode ?? "credits"}) and leave without pay. Use this
                  when credits were reconciled after the leave was approved.
                  The ledger and CSC Form 6 update automatically.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border p-2">
                    <div className="text-muted-foreground text-xs">
                      Days applied
                    </div>
                    <div className="font-medium">{currentDaysApplied}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-muted-foreground text-xs">
                      Currently paid / LWOP
                    </div>
                    <div className="font-medium">
                      {currentDaysWithPay} / {Math.max(0, currentDaysApplied - currentDaysWithPay)}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-muted-foreground text-xs">
                      Available {leaveTypeCode ?? ""} balance
                    </div>
                    <div className="font-medium">{currentBalance}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-muted-foreground text-xs">
                      Max payable
                    </div>
                    <div className="font-medium">{maxPayable}</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="override-days">New paid days</Label>
                  <Input
                    id="override-days"
                    type="number"
                    min={0}
                    max={maxPayable}
                    step="0.001"
                    value={overrideValue}
                    onChange={(e) => setOverrideValue(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Must be between 0 and {maxPayable}. The remainder becomes
                    leave without pay.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="override-reason">Reason</Label>
                  <Textarea
                    id="override-reason"
                    rows={3}
                    placeholder="e.g. VL credits reconciled today; charge the 1-day LWOP back to VL"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOverrideOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    loading ||
                    !overrideReason.trim() ||
                    overrideValue === "" ||
                    Number(overrideValue) === currentDaysWithPay ||
                    Number(overrideValue) < 0 ||
                    Number(overrideValue) > maxPayable
                  }
                  onClick={() =>
                    handle(async () => {
                      const r = await overrideApprovedLeaveDaysWithPay(
                        leaveId,
                        Number(overrideValue),
                        overrideReason,
                      );
                      if (!("error" in r) || !r.error) setOverrideOpen(false);
                      return r;
                    })
                  }
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        <Dialog open={cancelApprovedOpen} onOpenChange={setCancelApprovedOpen}>
          <DialogTrigger
            render={<Button variant="destructive" disabled={loading} />}
          >
            Cancel Approved Leave
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel Approved Leave</DialogTitle>
              <DialogDescription>
                This leave has already been approved. Cancelling it will refund
                the deducted credits. Provide a reason for the cancellation —
                it will be recorded in the audit trail.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Cancellation Reason</Label>
              <Textarea
                value={cancelApprovedReason}
                onChange={(e) => setCancelApprovedReason(e.target.value)}
                placeholder="e.g. Employee request — leave no longer needed"
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
                    const r = await cancelApprovedLeaveApplication(
                      leaveId,
                      cancelApprovedReason,
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
      </div>
    );
  }

  // Status stays "pending" through dept-head approval; only HR final approval
  // flips it to "approved". So gating on "pending" keeps Cancel/Approve/Reject
  // visible in the dept-approved-but-not-HR-approved in-between state.
  if (status !== "pending") return null;

  if (isRestrictedApproval) {
    // Leave was created by an OCM Admin — only that user may act on it.
    // Still render Cancel for the actual applicant (handled below via canCancel).
    return canCancel ? (
      <Button
        variant="outline"
        onClick={() => handle(() => cancelLeaveApplication(leaveId))}
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
  // Dept-level approval: Dept Heads and OCM Admin, before dept approval exists.
  const canApproveAsDeptHead =
    (isDeptHead(user.role) || isOcmAdmin) && !deptApprovedAt;
  // HR can only act once the department head has approved. super_admin can act
  // anytime; OCM Admin acts as HR only after dept-head approval.
  const hrCanAct =
    (user.role === "hr_admin" && !!deptApprovedAt) ||
    (isOcmAdmin && !!deptApprovedAt) ||
    user.role === "super_admin";

  return (
    <div className="flex gap-2 flex-wrap">
      {/* Dept-level approval — Dept Head or OCM Admin (Dept Admin is view-only) */}
      {canApproveAsDeptHead && (
        <Button onClick={() => handle(() => approveLeave(leaveId))} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Approve (Dept Head)
        </Button>
      )}

      {/* HR/Super Admin final approval — only after dept head approval (HR) */}
      {hrCanAct && (
        <Button onClick={() => handle(() => approveLeave(leaveId))} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {deptApprovedAt ? "Final Approve (HR)" : "Approve (HR)"}
        </Button>
      )}

      {/* Reject — dept head anytime; HR only after dept approval; super_admin
          anytime; OCM Admin at whichever stage it can approve. */}
      {(isDeptHead(user.role) || hrCanAct || canApproveAsDeptHead) && (
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger
            render={<Button variant="destructive" disabled={loading} />}
          >
            Reject
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Leave Application</DialogTitle>
              <DialogDescription>
                Provide a reason for rejecting this leave application.
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
                    const r = await rejectLeave(leaveId, rejectReason);
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

      {/* Cancel — applicant or HR, at any point before HR final approval
          (dept-head approval does not lock the application). */}
      {canCancel && (
        <Button
          variant="outline"
          onClick={() => handle(() => cancelLeaveApplication(leaveId))}
          disabled={loading}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Cancel Application
        </Button>
      )}
    </div>
  );
}

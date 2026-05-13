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
  approveLeave,
  rejectLeave,
  cancelLeaveApplication,
  cancelApprovedLeaveApplication,
} from "@/lib/actions/leave-actions";
import type { AuthUserData } from "@/lib/actions/auth-actions";

interface LeaveApprovalActionsProps {
  leaveId: string;
  status: string;
  deptApprovedAt: string | null;
  canCancel: boolean;
  user: AuthUserData;
}

export function LeaveApprovalActions({
  leaveId,
  status,
  deptApprovedAt,
  canCancel,
  user,
}: LeaveApprovalActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelApprovedOpen, setCancelApprovedOpen] = useState(false);
  const [cancelApprovedReason, setCancelApprovedReason] = useState("");

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

  // HR Admin / Super Admin can cancel an already-approved leave, with a
  // mandatory written reason. Credits are refunded automatically because the
  // balance view only counts approved rows.
  const canCancelApproved =
    status === "approved" &&
    (user.role === "super_admin" || user.role === "hr_admin");

  if (status === "approved") {
    if (!canCancelApproved) return null;
    return (
      <div className="flex gap-2 flex-wrap">
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

  // HR can only act once the department head has approved. super_admin can act anytime.
  const hrCanAct =
    (user.role === "hr_admin" && !!deptApprovedAt) || user.role === "super_admin";

  return (
    <div className="flex gap-2 flex-wrap">
      {/* Only Department Head can approve at dept level (Dept Admin is view-only) */}
      {user.role === "department_head" && !deptApprovedAt && (
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

      {/* Reject — dept head anytime; HR only after dept approval; super_admin anytime */}
      {(user.role === "department_head" || hrCanAct) && (
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

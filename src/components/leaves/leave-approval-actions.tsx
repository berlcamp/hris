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
import { approveLeave, rejectLeave, cancelLeaveApplication } from "@/lib/actions/leave-actions";
import type { AuthUserData } from "@/lib/actions/auth-actions";

interface LeaveApprovalActionsProps {
  leaveId: string;
  status: string;
  deptApprovedAt: string | null;
  employeeId: string;
  user: AuthUserData;
}

export function LeaveApprovalActions({
  leaveId,
  status,
  deptApprovedAt,
  employeeId,
  user,
}: LeaveApprovalActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

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

  if (status !== "pending") return null;

  return (
    <div className="flex gap-2 flex-wrap">
      {/* Department Head can approve if not yet approved at dept level */}
      {user.role === "department_head" && !deptApprovedAt && (
        <Button onClick={() => handle(() => approveLeave(leaveId))} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Approve (Dept Head)
        </Button>
      )}

      {/* HR/Admin can do final approval */}
      {["hr_admin", "super_admin"].includes(user.role) && (
        <Button onClick={() => handle(() => approveLeave(leaveId))} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {deptApprovedAt ? "Final Approve (HR)" : "Approve (HR)"}
        </Button>
      )}

      {/* Anyone with approval rights can reject */}
      {["department_head", "hr_admin", "super_admin"].includes(user.role) && (
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

      {/* Cancel button for the applicant or HR */}
      <Button
        variant="outline"
        onClick={() => handle(() => cancelLeaveApplication(leaveId))}
        disabled={loading}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Cancel Application
      </Button>
    </div>
  );
}

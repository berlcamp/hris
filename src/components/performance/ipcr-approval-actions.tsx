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
import { submitIpcrRecord, reviewIpcrRecord } from "@/lib/actions/ipcr-actions";
import type { AuthUserData } from "@/lib/actions/auth-actions";

interface IpcrApprovalActionsProps {
  recordId: string;
  status: string;
  user: AuthUserData;
  hasRating: boolean;
}

export function IpcrApprovalActions({
  recordId,
  status,
  user,
  hasRating,
}: IpcrApprovalActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const handle = async (
    action: () => Promise<{ success?: boolean; error?: string } | { error?: string }>
  ) => {
    setLoading(true);
    const result = await action();
    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success("Action completed successfully.");
      router.refresh();
    }
    setLoading(false);
  };

  // Draft → Submit for review
  if (
    status === "draft" &&
    ["super_admin", "hr_admin", "department_head"].includes(user.role)
  ) {
    return (
      <Button
        onClick={() => handle(() => submitIpcrRecord(recordId))}
        disabled={loading || !hasRating}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit for Review
      </Button>
    );
  }

  // Pending → Approve / Reject
  if (status === "pending") {
    return (
      <div className="flex gap-2 flex-wrap">
        {["department_head", "hr_admin", "super_admin"].includes(user.role) && (
          <>
            <Button
              onClick={() => handle(() => reviewIpcrRecord(recordId, true))}
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {user.role === "super_admin"
                ? "Final Approve"
                : "Approve / Recommend"}
            </Button>

            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
              <DialogTrigger
                render={<Button variant="destructive" disabled={loading} />}
              >
                Reject
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reject IPCR Record</DialogTitle>
                  <DialogDescription>
                    Provide a reason for rejecting this IPCR record.
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
                  <Button
                    variant="outline"
                    onClick={() => setRejectOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={loading || !rejectReason.trim()}
                    onClick={() =>
                      handle(async () => {
                        const r = await reviewIpcrRecord(
                          recordId,
                          false,
                          rejectReason
                        );
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
          </>
        )}
      </div>
    );
  }

  return null;
}

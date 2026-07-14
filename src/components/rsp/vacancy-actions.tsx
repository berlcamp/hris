"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, DoorClosed, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  cancelVacancy,
  closeVacancy,
  deleteDraftVacancy,
} from "@/lib/actions/rsp-actions";
import type { RspVacancyDetail } from "@/lib/actions/rsp-actions";

interface VacancyActionsProps {
  vacancy: RspVacancyDetail;
}

export function VacancyActions({ vacancy }: VacancyActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelRemarks, setCancelRemarks] = useState("");

  const beforeClosing =
    vacancy.closing_date != null &&
    new Date().toISOString().slice(0, 10) < vacancy.closing_date;

  const handleClose = async () => {
    setLoading(true);
    const result = await closeVacancy(vacancy.id, beforeClosing);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Vacancy closed. You can now run the HRMPSB assessment.");
      router.refresh();
    }
    setLoading(false);
  };

  const handleCancel = async () => {
    if (!cancelRemarks.trim()) {
      toast.error("State the reason for cancelling this recruitment.");
      return;
    }
    setLoading(true);
    const result = await cancelVacancy(vacancy.id, cancelRemarks.trim());
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Vacancy cancelled.");
      setCancelOpen(false);
      router.refresh();
    }
    setLoading(false);
  };

  const handleDeleteDraft = async () => {
    setLoading(true);
    const result = await deleteDraftVacancy(vacancy.id);
    if ("error" in result && result.error) {
      toast.error(result.error);
      setLoading(false);
    } else {
      toast.success("Draft vacancy deleted.");
      router.push("/rsp");
      router.refresh();
    }
  };

  return (
    <div className="flex items-center gap-2">
      {vacancy.status === "published" && (
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="outline" disabled={loading} />}
          >
            <DoorClosed className="h-4 w-4" />
            {beforeClosing ? "Close Early" : "Close Posting"}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Close this vacancy posting?</AlertDialogTitle>
              <AlertDialogDescription>
                {beforeClosing
                  ? `The posting period runs until ${vacancy.closing_date}. Closing early stops the receipt of further applications.`
                  : "No further applications will be received. Qualified candidates proceed to HRMPSB comparative assessment."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleClose}>
                {beforeClosing ? "Close anyway" : "Close posting"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {["draft", "published", "closed"].includes(vacancy.status) && (
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogTrigger
            render={<Button variant="outline" disabled={loading} />}
          >
            <Ban className="h-4 w-4" />
            Cancel Recruitment
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel this recruitment?</DialogTitle>
              <DialogDescription>
                The vacancy and its applications are kept on record but the
                recruitment is marked cancelled. The plantilla item becomes
                available for a new recruitment.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                rows={2}
                value={cancelRemarks}
                onChange={(e) => setCancelRemarks(e.target.value)}
                placeholder="e.g. Position abolished / publication superseded"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelOpen(false)}>
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancel}
                disabled={loading || !cancelRemarks.trim()}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Cancel Recruitment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {vacancy.status === "draft" && (
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="destructive" disabled={loading} />}
          >
            <Trash2 className="h-4 w-4" />
            Delete Draft
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this draft vacancy?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the draft and its assessment criteria.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteDraft}>
                Delete draft
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

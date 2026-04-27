"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteDraftNosi } from "@/lib/actions/nosi-actions";

type Presentation = "icon" | "button";

interface NosiDeleteDraftProps {
  nosiId: string;
  presentation?: Presentation;
  /** After successful delete. Default: refresh current route. */
  onDeleted?: () => void;
  /** If set, navigates here after a successful delete (e.g. `/nosi` from the detail page). */
  hrefAfterDelete?: string;
}

export function NosiDeleteDraft({
  nosiId,
  presentation = "button",
  onDeleted,
  hrefAfterDelete,
}: NosiDeleteDraftProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const runDelete = async () => {
    setDeleting(true);
    const result = await deleteDraftNosi(nosiId);
    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success("Draft NOSI deleted.");
      setOpen(false);
      if (onDeleted) onDeleted();
      else if (hrefAfterDelete) router.push(hrefAfterDelete);
      else router.refresh();
    }
    setDeleting(false);
  };

  return (
    <>
      {presentation === "icon" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          aria-label="Delete draft"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Delete draft
        </Button>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this draft NOSI?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the draft notice. Submitted or approved
            records cannot be deleted here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void runDelete()}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { deleteApplicant } from "@/lib/actions/rsp-actions";

interface RspApplicantDeleteProps {
  applicantId: string;
  applicantName: string;
  trigger: React.ReactElement;
}

export function RspApplicantDelete({
  applicantId,
  applicantName,
  trigger,
}: RspApplicantDeleteProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    const result = await deleteApplicant(applicantId);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Applicant deleted.");
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {applicantName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the applicant record. Applicants with
            applications on record cannot be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={loading}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

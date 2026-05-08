"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { flagAllEmployeesNeedingVlSlEntry } from "@/lib/actions/leave-actions";

export function FlagAllVlSlButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleFlag = async () => {
    setLoading(true);
    const result = await flagAllEmployeesNeedingVlSlEntry();
    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Flagged ${result.flagged} active employees as needing VL/SL entry.`);
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={loading} />}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
        Flag all VL/SL
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Flag all active employees?</AlertDialogTitle>
          <AlertDialogDescription>
            This sets <code>vl_sl_needs_manual_entry = true</code> for every
            active employee. After you reimport the leave-credits CSV, the flag
            clears for any employee whose VL or SL row was imported, leaving
            only those missing from the CSV still flagged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleFlag}>Flag all</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

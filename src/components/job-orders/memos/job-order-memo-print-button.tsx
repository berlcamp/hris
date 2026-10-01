"use client";

import { Loader2, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getJobOrderMemoById } from "@/lib/actions/job-order-memo-actions";
import { generateJobOrderMemoPrint } from "@/lib/pdf/generateJobOrderMemo";
import type { JobOrderMemo, JobOrderMemoMember } from "@/lib/types";

/** Prints a memo. Shared by the detail page and the list's row button. */
export function printJobOrderMemo(
  memo: JobOrderMemo,
  members: JobOrderMemoMember[],
) {
  generateJobOrderMemoPrint({
    memoType: memo.memo_type,
    memoNo: memo.memo_no,
    subject: memo.subject,
    memoDate: memo.memo_date,
    periodCovered: memo.period_covered,
    rows: members.map((m) => ({
      full_name: m.full_name,
      office_assignment: m.office_assignment,
      daily_rate: m.daily_rate,
    })),
  });
}

/**
 * Icon-only Print for the memo list's row actions. The list does not load
 * members per row, so they are fetched on click. Printing goes through a
 * hidden iframe (see print-html.ts), so it still works after the await —
 * there is no popup for a blocker to stop.
 */
export function JobOrderMemoPrintButton({ memo }: { memo: JobOrderMemo }) {
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    setLoading(true);
    try {
      const { memo: found, members } = await getJobOrderMemoById(memo.id);
      if (!found) {
        toast.error("Memo not found");
        return;
      }
      if (members.length === 0) {
        toast.error("This memo has no members to print");
        return;
      }
      printJobOrderMemo(found, members);
    } catch {
      toast.error("Could not load this memo's members. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      className="h-8 w-8 p-0"
      disabled={loading}
      title="Print memo"
      onClick={handlePrint}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Printer className="h-4 w-4" />
      )}
      <span className="sr-only">Print memo</span>
    </Button>
  );
}

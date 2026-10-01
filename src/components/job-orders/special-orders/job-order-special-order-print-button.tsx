"use client";

import { Loader2, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getJobOrderSpecialOrderById } from "@/lib/actions/job-order-special-order-actions";
import { generateJobOrderSpecialOrderPrint } from "@/lib/pdf/generateJobOrderSpecialOrder";
import type {
  JobOrderSpecialOrder,
  JobOrderSpecialOrderMember,
} from "@/lib/types";

/** Prints a special order. Shared by the detail page and the list's row button. */
export function printJobOrderSpecialOrder(
  specialOrder: JobOrderSpecialOrder,
  members: JobOrderSpecialOrderMember[],
) {
  generateJobOrderSpecialOrderPrint({
    soNo: specialOrder.so_no,
    subject: specialOrder.subject,
    soDate: specialOrder.so_date,
    periodCovered: specialOrder.period_covered,
    rows: members.map((m) => ({
      full_name: m.full_name,
      area_assigned: m.area_assigned,
    })),
  });
}

/**
 * Icon-only Print for the special order list's row actions. The list does
 * not load members per row, so they are fetched on click. Printing goes
 * through a hidden iframe (see print-html.ts), so it still works after the
 * await — there is no popup for a blocker to stop.
 */
export function JobOrderSpecialOrderPrintButton({
  specialOrder,
}: {
  specialOrder: JobOrderSpecialOrder;
}) {
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    setLoading(true);
    try {
      const { specialOrder: found, members } =
        await getJobOrderSpecialOrderById(specialOrder.id);
      if (!found) {
        toast.error("Special order not found");
        return;
      }
      if (members.length === 0) {
        toast.error("This special order has no members to print");
        return;
      }
      printJobOrderSpecialOrder(found, members);
    } catch {
      toast.error(
        "Could not load this special order's members. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      className="h-8 w-8 p-0"
      disabled={loading}
      title="Print special order"
      onClick={handlePrint}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Printer className="h-4 w-4" />
      )}
      <span className="sr-only">Print special order</span>
    </Button>
  );
}

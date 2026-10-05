"use client";

import { Loader2, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getJobOrderSssContributionsForMonth } from "@/lib/actions/job-order-payroll-actions";
import {
  endOfMonth,
  formatMonthLabel,
  isMonthKey,
  startOfMonth,
} from "@/lib/month-range";
import { generateRemittanceListAmortizationPrint } from "@/lib/pdf/generatePayroll";

/** The current month in local time, as "YYYY-MM". */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The monthly SSS Contribution List, from the payroll list's header. A payroll
 * belongs to the month its period starts in, and each worker gets one line
 * with SS and EC summed across that month's payrolls — see sumSssByWorker.
 *
 * Printing goes through a hidden iframe (see print-html.ts), so it still works
 * after the await — there is no popup for a blocker to stop.
 */
export function JobOrderSssMonthlyPrintDialog() {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(currentMonthKey);
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    if (!isMonthKey(month)) {
      toast.error("Pick a month");
      return;
    }
    setLoading(true);
    try {
      const { rows, error } = await getJobOrderSssContributionsForMonth(month);
      if (error) {
        toast.error(error);
        return;
      }
      if (rows.length === 0) {
        toast.error(
          `No SSS contributions on payrolls starting in ${formatMonthLabel(month)}`,
        );
        return;
      }
      generateRemittanceListAmortizationPrint({
        kind: "sss",
        rows: rows.map((r) => ({
          employeeName: r.full_name,
          ssNumber: r.sss_no,
          seVm: "VM" as const,
          ss: r.ss,
          ec: r.ec,
        })),
        periodStart: startOfMonth(month),
        periodEnd: endOfMonth(month),
        employeeGroup: "LGU OZAMIZ-JOB ORDER WORKERS",
        preparedBy: {
          name: "MARICELL P. SALVADOR",
          position: "Day Care Worker I",
          office: null,
        },
        notedBy: {
          name: "RUTHEZA GRACE A. OUANO",
          position: "City Administrator",
          office: null,
        },
      });
      setOpen(false);
    } catch {
      toast.error("Could not load the SSS contributions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Printer className="h-4 w-4" />
        Print SSS Contributions
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Print SSS Contributions</DialogTitle>
            <DialogDescription>
              Lists every job order worker&apos;s SS and EC from the payrolls
              whose period starts in the chosen month, one line per worker.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sss-month">Month</Label>
            <Input
              id="sss-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handlePrint} disabled={loading || !month}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

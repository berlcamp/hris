"use client";

import { ChevronDown, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getJobOrderPayrollById } from "@/lib/actions/job-order-payroll-actions";
import { toPrintRow } from "@/lib/job-order-payroll-helpers";
import {
  generateJoPayrollObrPrint,
  generateJoPayrollPrint,
  generateJoPayrollSummaryPrint,
  type GenerateJoPayrollPrintParams,
} from "@/lib/pdf/generateJobOrderPayroll";
import type { JobOrderPayroll, JobOrderPayrollMember } from "@/lib/types";

interface JobOrderPayrollPrintMenuProps {
  payroll: JobOrderPayroll;
  /**
   * The detail page already has the members and passes them. The list page
   * does not load members per row, so it omits this and the menu fetches them
   * when a document is picked.
   */
  members?: JobOrderPayrollMember[];
  /** Icon-only trigger, for the list's row actions. */
  compact?: boolean;
}

/**
 * Two toggles and three documents.
 *
 * The toggles shape the Daily Wages Payroll form rather than picking between
 * separate documents: "Include SSS" fills the SS / EC deduction columns,
 * "With ATM" swaps the trailing column group between the Landbank account
 * number and the Community Tax details. Neither changes which members print.
 *
 * "Include SSS" also reaches the Summary, whose amounts are net and whose
 * second sheet totals the SS / EC shares per payroll number — with the toggle
 * off that sheet is not printed at all. It does not reach the OBR, which is
 * obligated at gross either way — see generateJoPayrollObrPrint. The SSS
 * Contribution List is not here: it is monthly, across payrolls, and prints
 * from the list page's header (JobOrderSssMonthlyPrintDialog). Both toggles
 * are on by default, so the common case is open → Print Payroll.
 *
 * Printing opens the browser's native print dialog directly through a hidden
 * iframe (see generateJobOrderPayroll.ts's module comment), so it still works
 * after the await on the list page — there is no popup for a blocker to stop.
 * The only pending state is that member fetch.
 */
export function JobOrderPayrollPrintMenu({
  payroll,
  members: preloaded,
  compact = false,
}: JobOrderPayrollPrintMenuProps) {
  // Base UI's checkbox items do not close the menu on click (closeOnClick
  // defaults to false), so both toggles and the Print Payroll click happen in
  // one interaction without the menu reopening in between.
  const [includeSss, setIncludeSss] = useState(true);
  const [withAtm, setWithAtm] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadMembers = async (): Promise<JobOrderPayrollMember[] | null> => {
    if (preloaded) return preloaded;
    setLoading(true);
    try {
      const { payroll: found, members } = await getJobOrderPayrollById(
        payroll.id,
      );
      if (!found) {
        toast.error("Payroll not found");
        return null;
      }
      return members;
    } catch {
      toast.error("Could not load this payroll's members. Please try again.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const printWith =
    (generate: (params: GenerateJoPayrollPrintParams) => void) => async () => {
      const members = await loadMembers();
      if (!members) return;
      generate({
        rows: members.map(toPrintRow),
        periodStart: payroll.period_start,
        periodEnd: payroll.period_end,
        particulars: payroll.particulars,
        withAtm,
        showSss: includeSss,
      });
    };

  return (
    <DropdownMenu>
      {compact ? (
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-8 w-8 p-0"
              disabled={loading}
              title="Print"
            />
          }
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Printer className="h-4 w-4" />
          )}
          <span className="sr-only">Print</span>
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger render={<Button size="sm" disabled={loading} />}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Printer className="h-4 w-4" />
          )}
          Print
          <ChevronDown className="h-4 w-4" />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        align={compact ? "start" : "end"}
        className="w-64"
      >
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            checked={includeSss}
            onCheckedChange={setIncludeSss}
          >
            Include SSS
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={withAtm}
            onCheckedChange={setWithAtm}
          >
            With ATM
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={printWith(generateJoPayrollPrint)}>
          Print Payroll
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={printWith(generateJoPayrollSummaryPrint)}
        >
          Print Summary
        </DropdownMenuItem>
        <DropdownMenuItem onClick={printWith(generateJoPayrollObrPrint)}>
          Print OBR
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

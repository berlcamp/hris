"use client";

import { ChevronDown, Printer } from "lucide-react";
import { useState } from "react";

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
  members: JobOrderPayrollMember[];
  isDraft: boolean;
}

/**
 * Two toggles and three documents.
 *
 * The toggles shape the Daily Wages Payroll form rather than picking between
 * separate documents: "Include SSS" fills the SS / EC deduction columns,
 * "With ATM" swaps the trailing column group between the Landbank account
 * number and the Community Tax details. Neither changes which members print.
 *
 * "Include SSS" also reaches the Summary, whose amounts are net. It does not
 * reach the OBR, which is obligated at gross either way — see
 * generateJoPayrollObrPrint. Both toggles are on by default, so the common
 * case is open → Print Payroll.
 *
 * Printing opens the browser's native print dialog directly (see
 * generateJobOrderPayroll.ts's module comment) — there is no download/blob step
 * to wait on, hence no pending state here.
 */
export function JobOrderPayrollPrintMenu({
  payroll,
  members,
  isDraft,
}: JobOrderPayrollPrintMenuProps) {
  // Base UI's checkbox items do not close the menu on click (closeOnClick
  // defaults to false), so both toggles and the Print Payroll click happen in
  // one interaction without the menu reopening in between.
  const [includeSss, setIncludeSss] = useState(true);
  const [withAtm, setWithAtm] = useState(true);

  const printParams: GenerateJoPayrollPrintParams = {
    rows: members.map(toPrintRow),
    periodStart: payroll.period_start,
    periodEnd: payroll.period_end,
    particulars: payroll.particulars,
    withAtm,
    showSss: includeSss,
    draft: isDraft,
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" />}>
        <Printer className="h-4 w-4" />
        Print
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
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
        <DropdownMenuItem onClick={() => generateJoPayrollPrint(printParams)}>
          Print Payroll
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => generateJoPayrollSummaryPrint(printParams)}
        >
          Print Summary
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => generateJoPayrollObrPrint(printParams)}>
          Print OBR
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

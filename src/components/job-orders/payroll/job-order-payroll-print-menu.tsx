"use client";

import { ChevronDown, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toPrintRow } from "@/lib/job-order-payroll-helpers";
import {
  generateJoPayrollByDeptPrint,
  generateJoPayrollNoAtmPrint,
  generateJoPayrollNoSssPrint,
  generateJoPayrollObrOvertimePrint,
  generateJoPayrollObrPrint,
  generateJoPayrollOvertimeNoAtmPrint,
  generateJoPayrollOvertimePrint,
  generateJoPayrollPrint,
  generateJoPayrollSummaryOvertimePrint,
  generateJoPayrollSummaryPrint,
  type GenerateJoPayrollPrintParams,
} from "@/lib/pdf/generateJobOrderPayroll";
import type { JobOrderPayroll, JobOrderPayrollMember } from "@/lib/types";

interface JobOrderPayrollPrintMenuProps {
  payroll: JobOrderPayroll;
  members: JobOrderPayrollMember[];
  isDraft: boolean;
}

/** All ten print generators, listed in a dropdown. Each opens the browser's
 * native print dialog directly (see generateJobOrderPayroll.ts's module
 * comment) — there is no download/blob step to wait on. */
export function JobOrderPayrollPrintMenu({
  payroll,
  members,
  isDraft,
}: JobOrderPayrollPrintMenuProps) {
  const printParams: GenerateJoPayrollPrintParams = {
    rows: members.map(toPrintRow),
    periodStart: payroll.period_start,
    periodEnd: payroll.period_end,
    particulars: payroll.particulars,
    description: payroll.description,
    areas: payroll.areas,
    draft: isDraft,
  };

  const printVariants: { label: string; run: () => void }[] = [
    {
      label: "Daily Wages Payroll (with SSS)",
      run: () => generateJoPayrollPrint(printParams),
    },
    {
      label: "Daily Wages Payroll (No SSS)",
      run: () => generateJoPayrollNoSssPrint(printParams),
    },
    {
      label: "By Department",
      run: () => generateJoPayrollByDeptPrint(printParams),
    },
    { label: "Summary", run: () => generateJoPayrollSummaryPrint(printParams) },
    {
      label: "Cash Payable (No ATM)",
      run: () => generateJoPayrollNoAtmPrint(printParams),
    },
    {
      label: "Overtime (with ATM)",
      run: () => generateJoPayrollOvertimePrint(printParams),
    },
    {
      label: "Overtime (No ATM)",
      run: () => generateJoPayrollOvertimeNoAtmPrint(printParams),
    },
    {
      label: "Summary + Overtime",
      run: () => generateJoPayrollSummaryOvertimePrint(printParams),
    },
    { label: "OBR", run: () => generateJoPayrollObrPrint(printParams) },
    {
      label: "OBR (Overtime)",
      run: () => generateJoPayrollObrOvertimePrint(printParams),
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" />}>
        <Printer className="h-4 w-4" />
        Print
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Print variant</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {printVariants.map((v) => (
          <DropdownMenuItem key={v.label} onClick={v.run}>
            {v.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

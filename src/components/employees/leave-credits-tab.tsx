"use client";

import { AlertTriangle, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LeaveCreditAdjustmentDialog } from "@/components/leaves/leave-credit-adjustment-dialog";
import type { LeaveTypeRow } from "@/lib/actions/leave-actions";

interface LeaveCreditWithType {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  total_credits: number;
  used_credits: number;
  balance: number;
  leave_types: { code: string; name: string } | null;
}

interface LeaveCreditsTabProps {
  leaveCredits: LeaveCreditWithType[];
  employeeId: string;
  employeeName: string;
  leaveTypes: LeaveTypeRow[];
  isAdmin: boolean;
  needsManualEntry: boolean;
}

export function LeaveCreditsTab({
  leaveCredits,
  employeeId,
  employeeName,
  leaveTypes,
  isAdmin,
  needsManualEntry,
}: LeaveCreditsTabProps) {
  const year = new Date().getFullYear();

  // Build cards from all leave types so admins can adjust types the employee
  // doesn't yet have a balance for. Existing rows take precedence.
  const cards = leaveTypes.map((lt) => {
    const existing = leaveCredits.find((c) => c.leave_type_id === lt.id);
    return {
      leaveType: lt,
      credit: existing,
    };
  });

  if (!isAdmin && leaveCredits.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No leave credits allocated for this year.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {needsManualEntry && (
        <div className="flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              VL/SL needs manual entry
            </p>
            <p className="text-amber-800 dark:text-amber-300">
              This employee was not in the legacy CSV import, so their VL and SL
              balances were reset to zero. Use the pencil button on the VL or
              SL card to enter the correct starting balance — this will clear
              the warning.
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(({ leaveType, credit }) => {
        // Hide empty cards from non-admins; admins see every type so they can
        // seed a balance via adjustment.
        if (!credit && !isAdmin) return null;

        return (
          <Card key={leaveType.id}>
            <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-medium">
                  {leaveType.name}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{leaveType.code}</p>
              </div>
              {isAdmin && (
                <LeaveCreditAdjustmentDialog
                  employeeId={employeeId}
                  employeeName={employeeName}
                  leaveTypes={leaveTypes}
                  year={year}
                  fixedLeaveType={{
                    id: leaveType.id,
                    code: leaveType.code,
                    name: leaveType.name,
                  }}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Adjust ${leaveType.code}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
              )}
            </CardHeader>
            <CardContent>
              {credit ? (
                <>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold">{credit.balance}</span>
                    <span className="text-sm text-muted-foreground">
                      / {credit.total_credits}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {credit.used_credits} used
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No balance — click pencil to add.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
      </div>
    </div>
  );
}

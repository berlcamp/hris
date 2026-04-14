"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pdf } from "@react-pdf/renderer";
import { LeaveForm6Pdf } from "@/components/pdf/leave-form6-pdf";
import type { LeaveApplicationWithRelations } from "@/lib/actions/leave-actions";

interface LeavePdfButtonProps {
  leave: LeaveApplicationWithRelations;
  totalCredits: number;
  usedCredits: number;
  balance: number;
}

export function LeavePdfButton({ leave, totalCredits, usedCredits, balance }: LeavePdfButtonProps) {
  const [generating, setGenerating] = useState(false);

  const emp = leave.employees;
  const employeeName = emp ? `${emp.first_name} ${emp.last_name}` : "Unknown";

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const blob = await pdf(
        <LeaveForm6Pdf
          employeeName={employeeName}
          employeeNo={emp?.employee_no ?? ""}
          position={emp?.positions?.title ?? ""}
          department={emp?.departments?.name ?? ""}
          leaveType={leave.leave_types?.name ?? ""}
          leaveTypeCode={leave.leave_types?.code ?? ""}
          startDate={leave.start_date}
          endDate={leave.end_date}
          daysApplied={leave.days_applied}
          reason={leave.reason}
          totalCredits={totalCredits}
          usedCredits={usedCredits}
          balance={balance}
          status={leave.status}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Leave-Form6-${emp?.employee_no ?? "record"}-${leave.start_date}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // PDF generation may not work in all environments
    }
    setGenerating(false);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      CSC Form 6
    </Button>
  );
}

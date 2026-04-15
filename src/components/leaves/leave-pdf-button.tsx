"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pdf } from "@react-pdf/renderer";
import { LeaveForm6Pdf } from "@/components/pdf/leave-form6-pdf";
import type { LeaveApplicationWithRelations, LeaveCreditRow } from "@/lib/actions/leave-actions";
import { format } from "date-fns";

interface LeavePdfButtonProps {
  leave: LeaveApplicationWithRelations;
  credits: LeaveCreditRow[];
}

export function LeavePdfButton({ leave, credits }: LeavePdfButtonProps) {
  const [generating, setGenerating] = useState(false);

  const emp = leave.employees;
  const employeeName = emp
    ? `${emp.last_name}, ${emp.first_name}${emp.middle_name ? ` ${emp.middle_name}` : ""}`
    : "Unknown";

  // Find VL and SL credits
  const vlCredit = credits.find((c) => c.leave_types?.code === "VL");
  const slCredit = credits.find((c) => c.leave_types?.code === "SL");

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const blob = await pdf(
        <LeaveForm6Pdf
          employeeName={employeeName}
          employeeNo={emp?.employee_no ?? ""}
          middleName={emp?.middle_name ?? ""}
          position={emp?.positions?.title ?? ""}
          department={emp?.departments?.name ?? ""}
          salaryGrade={emp?.salary_grade ?? 0}
          dateOfFiling={format(new Date(leave.created_at), "MMMM d, yyyy")}
          leaveType={leave.leave_types?.name ?? ""}
          leaveTypeCode={leave.leave_types?.code ?? ""}
          startDate={leave.start_date}
          endDate={leave.end_date}
          daysApplied={leave.days_applied}
          reason={leave.reason}
          detailsOfLeave={leave.details_of_leave}
          commutationRequested={leave.commutation_requested}
          vlTotal={vlCredit ? Number(vlCredit.total_credits) : 0}
          vlUsed={vlCredit ? Number(vlCredit.used_credits) : 0}
          vlBalance={vlCredit ? Number(vlCredit.balance) : 0}
          slTotal={slCredit ? Number(slCredit.total_credits) : 0}
          slUsed={slCredit ? Number(slCredit.used_credits) : 0}
          slBalance={slCredit ? Number(slCredit.balance) : 0}
          leaveDates={leave.leave_dates ?? []}
          status={leave.status}
          allLeaveTypeCodes={credits.map((c) => c.leave_types?.code ?? "").filter(Boolean)}
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

"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
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
import { pdf } from "@react-pdf/renderer";
import { LeaveForm6Pdf } from "@/components/pdf/leave-form6-pdf";
import type { LeaveApplicationWithRelations, LeaveCreditRow } from "@/lib/actions/leave-actions";
import { getEffectivePosition } from "@/lib/employee-position";
import { format } from "date-fns";

interface LeavePdfButtonProps {
  leave: LeaveApplicationWithRelations;
  credits: LeaveCreditRow[];
}

export function LeavePdfButton({ leave, credits }: LeavePdfButtonProps) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [signatory7A, setSignatory7A] = useState("");
  const [signatory7APosition, setSignatory7APosition] = useState("");
  const [signatory7B, setSignatory7B] = useState("");
  const [signatory7BPosition, setSignatory7BPosition] = useState("");
  const [signatoryFinal, setSignatoryFinal] = useState("");
  const [signatoryFinalPosition, setSignatoryFinalPosition] = useState("");

  const emp = leave.employees;
  const employeeName = emp
    ? `${emp.last_name}, ${emp.first_name}${emp.middle_name ? ` ${emp.middle_name}` : ""}`
    : "Unknown";

  // Find VL and SL credits
  const vlCredit = credits.find((c) => c.leave_types?.code === "VL");
  const slCredit = credits.find((c) => c.leave_types?.code === "SL");

  // CSC Form 6 §7.A is a running ledger: Total Earned − Less this application = Balance.
  // Only the paid portion (days_with_pay) consumes credits; LWOP excess is shown
  // separately in §7.C. The DB `balance` already excludes approved paid usage, so
  // for an already-approved leave we add the paid days back to recover the
  // pre-deduction "Total Earned" value.
  const code = leave.leave_types?.code ?? "";
  // §7.A only certifies VL and SL credits — any other leave type (FL, SPL, ML,
  // PL, …) leaves the ledger untouched on the printed form.
  const debitsVl = code === "VL";
  const debitsSl = code === "SL";
  const isApproved = leave.status === "approved";
  const daysWithPay = Number(leave.days_with_pay ?? leave.days_applied);

  const vlBalanceNow = vlCredit ? Number(vlCredit.balance) : 0;
  const slBalanceNow = slCredit ? Number(slCredit.balance) : 0;
  const addBackVl = isApproved && debitsVl ? daysWithPay : 0;
  const addBackSl = isApproved && debitsSl ? daysWithPay : 0;

  const vlTotalEarned = vlBalanceNow + addBackVl;
  const slTotalEarned = slBalanceNow + addBackSl;
  const vlBalanceAfter = vlTotalEarned - (debitsVl ? daysWithPay : 0);
  const slBalanceAfter = slTotalEarned - (debitsSl ? daysWithPay : 0);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Pre-load logos as data URLs so @react-pdf/renderer doesn't need to
      // fetch them during render (avoids silent image-loader failures).
      const fetchAsDataUrl = async (path: string): Promise<string | undefined> => {
        try {
          const res = await fetch(path);
          if (!res.ok) return undefined;
          const blob = await res.blob();
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
        } catch {
          return undefined;
        }
      };

      const [logo1, logo2, logo3, logo4] = await Promise.all([
        fetchAsDataUrl("/logo1.png"),
        fetchAsDataUrl("/logo2.png"),
        fetchAsDataUrl("/logo3.png"),
        fetchAsDataUrl("/logo4.png"),
      ]);

      const blob = await pdf(
        <LeaveForm6Pdf
          titleLogos={[logo1, logo2, logo3, logo4]}
          employeeName={employeeName}
          employeeNo={emp != null ? String(emp.biometric_no) : ""}
          middleName={emp?.middle_name ?? ""}
          position={emp ? getEffectivePosition(emp) ?? "" : ""}
          department={emp?.departments?.name ?? ""}
          salaryGrade={emp?.salary_grade ?? 0}
          dateOfFiling={format(new Date(leave.created_at), "MMMM d, yyyy")}
          leaveType={leave.leave_types?.name ?? ""}
          leaveTypeCode={leave.leave_types?.code ?? ""}
          startDate={leave.start_date}
          endDate={leave.end_date}
          daysApplied={leave.days_applied}
          daysWithPay={daysWithPay}
          reason={leave.reason}
          detailsOfLeave={leave.details_of_leave}
          commutationRequested={leave.commutation_requested}
          vlTotal={vlTotalEarned}
          vlUsed={vlCredit ? Number(vlCredit.used_credits) : 0}
          vlBalance={vlBalanceAfter}
          slTotal={slTotalEarned}
          slUsed={slCredit ? Number(slCredit.used_credits) : 0}
          slBalance={slBalanceAfter}
          leaveDates={leave.leave_dates ?? []}
          status={leave.status}
          allLeaveTypeCodes={credits.map((c) => c.leave_types?.code ?? "").filter(Boolean)}
          signatory7A={signatory7A.trim()}
          signatory7APosition={signatory7APosition.trim()}
          signatory7B={signatory7B.trim()}
          signatory7BPosition={signatory7BPosition.trim()}
          signatoryFinal={signatoryFinal.trim()}
          signatoryFinalPosition={signatoryFinalPosition.trim()}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Leave-Form6-${leave.start_date}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err) {
      console.error("Failed to render CSC Form 6 PDF:", err);
      toast.error(
        err instanceof Error
          ? `PDF generation failed: ${err.message}`
          : "PDF generation failed",
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4" />
        CSC Form 6
      </Button>
      <Dialog open={open} onOpenChange={(v) => !generating && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signatories for CSC Form 6</DialogTitle>
            <DialogDescription>
              Enter the names to print on the signature lines. Leave a field blank to keep it empty.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>7.A Certification of Leave Credits</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  id="sig-7a"
                  value={signatory7A}
                  onChange={(e) => setSignatory7A(e.target.value)}
                  aria-label="7.A name"
                  autoFocus
                />
                <Input
                  id="sig-7a-position"
                  value={signatory7APosition}
                  onChange={(e) => setSignatory7APosition(e.target.value)}
                  aria-label="7.A position"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <span>Name</span>
                <span>Position (e.g., HRMO)</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>7.B Recommendation</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  id="sig-7b"
                  value={signatory7B}
                  onChange={(e) => setSignatory7B(e.target.value)}
                  aria-label="7.B name"
                />
                <Input
                  id="sig-7b-position"
                  value={signatory7BPosition}
                  onChange={(e) => setSignatory7BPosition(e.target.value)}
                  aria-label="7.B position"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <span>Name</span>
                <span>Position (e.g., Department Head)</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Final Leave Approval</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  id="sig-final"
                  value={signatoryFinal}
                  onChange={(e) => setSignatoryFinal(e.target.value)}
                  aria-label="Final approver name"
                />
                <Input
                  id="sig-final-position"
                  value={signatoryFinalPosition}
                  onChange={(e) => setSignatoryFinalPosition(e.target.value)}
                  aria-label="Final approver position"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <span>Name</span>
                <span>Position (e.g., City Mayor)</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={generating}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleGenerate} disabled={generating}>
              {generating && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

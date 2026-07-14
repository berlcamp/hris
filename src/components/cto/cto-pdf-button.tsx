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
import { CtoApplicationPdf } from "@/components/pdf/cto-application-pdf";
import type { CtoApplicationWithRelations } from "@/lib/actions/cto-actions";
import { getEffectivePosition } from "@/lib/employee-position";
import { formatManilaLongDate } from "@/lib/format-date";

interface CtoPdfButtonProps {
  cto: CtoApplicationWithRelations;
  /** Current available COC balance (hours); null hides the balance cells. */
  availableBalance: number | null;
}

// Pre-load logos as data URLs so @react-pdf/renderer doesn't need to fetch
// them during render (avoids silent image-loader failures).
async function fetchAsDataUrl(path: string): Promise<string | undefined> {
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
}

export function CtoPdfButton({ cto, availableBalance }: CtoPdfButtonProps) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [signatoryDeptHead, setSignatoryDeptHead] = useState("");
  const [signatoryDeptHeadPosition, setSignatoryDeptHeadPosition] = useState("");
  const [signatoryFinal, setSignatoryFinal] = useState("");
  const [signatoryFinalPosition, setSignatoryFinalPosition] = useState("");

  const emp = cto.employees;
  const employeeName = emp
    ? `${emp.last_name}, ${emp.first_name}${emp.middle_name ? ` ${emp.middle_name}` : ""}${emp.suffix ? ` ${emp.suffix}` : ""}`
    : "Unknown";

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const [logo1, logo2, logo3, logo4] = await Promise.all([
        fetchAsDataUrl("/logo1.png"),
        fetchAsDataUrl("/logo2.png"),
        fetchAsDataUrl("/logo3.png"),
        fetchAsDataUrl("/logo4.png"),
      ]);

      const blob = await pdf(
        <CtoApplicationPdf
          titleLogos={[logo1, logo2, logo3, logo4]}
          employeeName={employeeName}
          position={emp ? getEffectivePosition(emp) ?? "" : ""}
          department={emp?.departments?.name ?? ""}
          dateOfFiling={formatManilaLongDate(cto.created_at)}
          ctoDates={cto.cto_dates ?? []}
          startDate={cto.start_date}
          endDate={cto.end_date}
          hoursApplied={Number(cto.hours_applied)}
          reason={cto.reason}
          status={cto.status}
          availableBalance={availableBalance}
          deptApprovedAt={cto.dept_approved_at}
          hrApprovedAt={cto.hr_approved_at}
          signatoryDeptHead={signatoryDeptHead.trim()}
          signatoryDeptHeadPosition={signatoryDeptHeadPosition.trim()}
          signatoryFinal={signatoryFinal.trim()}
          signatoryFinalPosition={signatoryFinalPosition.trim()}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `CTO-Application-${cto.start_date}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err) {
      console.error("Failed to render CTO application PDF:", err);
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
        CTO Form
      </Button>
      <Dialog open={open} onOpenChange={(v) => !generating && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signatories for CTO Form</DialogTitle>
            <DialogDescription>
              Enter the names to print on the signature lines. Leave a field
              blank to keep it empty.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Department Head</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={signatoryDeptHead}
                  onChange={(e) => setSignatoryDeptHead(e.target.value)}
                  aria-label="Department head name"
                  autoFocus
                />
                <Input
                  value={signatoryDeptHeadPosition}
                  onChange={(e) => setSignatoryDeptHeadPosition(e.target.value)}
                  aria-label="Department head position"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <span>Name</span>
                <span>Position (e.g., Department Head)</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Final Approval</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={signatoryFinal}
                  onChange={(e) => setSignatoryFinal(e.target.value)}
                  aria-label="Final approver name"
                />
                <Input
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

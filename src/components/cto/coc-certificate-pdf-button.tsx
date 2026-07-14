"use client";

import { useState } from "react";
import { Award, Loader2 } from "lucide-react";
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
import {
  CocCertificatePdf,
  type CocCertificateEntry,
} from "@/components/pdf/coc-certificate-pdf";
import { formatManilaLongDate } from "@/lib/format-date";

interface CocCertificatePdfButtonProps {
  employee: {
    first_name: string;
    last_name: string;
    middle_name: string | null;
    suffix: string | null;
    department: string | null;
    position: string | null;
  };
  credits: CocCertificateEntry[];
  available: number;
}

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

export function CocCertificatePdfButton({
  employee,
  credits,
  available,
}: CocCertificatePdfButtonProps) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [signatoryHr, setSignatoryHr] = useState("");
  const [signatoryHrPosition, setSignatoryHrPosition] = useState("");
  const [signatoryHead, setSignatoryHead] = useState("");
  const [signatoryHeadPosition, setSignatoryHeadPosition] = useState("");

  const employeeName = `${employee.last_name}, ${employee.first_name}${employee.middle_name ? ` ${employee.middle_name}` : ""}${employee.suffix ? ` ${employee.suffix}` : ""}`;
  const totalEarned = credits.reduce((acc, c) => acc + Number(c.hours_earned), 0);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const [logo1, logo2, logo3, logo4] = await Promise.all([
        fetchAsDataUrl("/logo1.png"),
        fetchAsDataUrl("/logo2.png"),
        fetchAsDataUrl("/logo3.png"),
        fetchAsDataUrl("/logo4.png"),
      ]);

      const sorted = [...credits].sort((a, b) =>
        a.ot_date.localeCompare(b.ot_date)
      );

      const blob = await pdf(
        <CocCertificatePdf
          titleLogos={[logo1, logo2, logo3, logo4]}
          employeeName={employeeName}
          position={employee.position ?? ""}
          department={employee.department ?? ""}
          entries={sorted}
          totalEarned={totalEarned}
          availableBalance={available}
          issuedDate={formatManilaLongDate(new Date())}
          signatoryHr={signatoryHr.trim()}
          signatoryHrPosition={signatoryHrPosition.trim()}
          signatoryHead={signatoryHead.trim()}
          signatoryHeadPosition={signatoryHeadPosition.trim()}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `COC-Certificate-${employee.last_name}-${employee.first_name}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err) {
      console.error("Failed to render COC certificate PDF:", err);
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
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={credits.length === 0}
      >
        <Award className="h-4 w-4" />
        COC Certificate
      </Button>
      <Dialog open={open} onOpenChange={(v) => !generating && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signatories for COC Certificate</DialogTitle>
            <DialogDescription>
              Enter the names to print on the certificate&apos;s signature
              lines. Leave a field blank to keep it empty.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Certifying HR Officer</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={signatoryHr}
                  onChange={(e) => setSignatoryHr(e.target.value)}
                  aria-label="HR officer name"
                  autoFocus
                />
                <Input
                  value={signatoryHrPosition}
                  onChange={(e) => setSignatoryHrPosition(e.target.value)}
                  aria-label="HR officer position"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <span>Name</span>
                <span>Position (e.g., HRMO)</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Agency Head / Authorized Official</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={signatoryHead}
                  onChange={(e) => setSignatoryHead(e.target.value)}
                  aria-label="Agency head name"
                />
                <Input
                  value={signatoryHeadPosition}
                  onChange={(e) => setSignatoryHeadPosition(e.target.value)}
                  aria-label="Agency head position"
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

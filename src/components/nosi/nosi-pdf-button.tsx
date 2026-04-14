"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pdf } from "@react-pdf/renderer";
import { NosiPdf } from "@/components/pdf/nosi-pdf";
import type { NosiWithRelations } from "@/lib/actions/nosi-actions";

interface NosiPdfButtonProps {
  nosi: NosiWithRelations;
  employeeName: string;
}

export function NosiPdfButton({ nosi, employeeName }: NosiPdfButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const blob = await pdf(
        <NosiPdf
          employeeName={employeeName}
          employeeNo={nosi.employees?.employee_no ?? ""}
          position={nosi.employees?.positions?.title ?? ""}
          department={nosi.employees?.departments?.name ?? ""}
          currentSalaryGrade={nosi.current_salary_grade}
          currentStep={nosi.current_step}
          newStep={nosi.new_step}
          currentSalary={nosi.current_salary}
          newSalary={nosi.new_salary}
          effectiveDate={nosi.effective_date}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `NOSI-${nosi.employees?.employee_no ?? "record"}-${nosi.effective_date}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail — PDF generation may not work in all environments
    }
    setGenerating(false);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      Generate PDF
    </Button>
  );
}

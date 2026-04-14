"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pdf } from "@react-pdf/renderer";
import { NosaPdf } from "@/components/pdf/nosa-pdf";
import type { NosaWithRelations } from "@/lib/actions/nosa-actions";

interface NosaPdfButtonProps {
  nosa: NosaWithRelations;
  employeeName: string;
}

export function NosaPdfButton({ nosa, employeeName }: NosaPdfButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const blob = await pdf(
        <NosaPdf
          employeeName={employeeName}
          employeeNo={nosa.employees?.employee_no ?? ""}
          position={nosa.employees?.positions?.title ?? ""}
          department={nosa.employees?.departments?.name ?? ""}
          previousSalaryGrade={nosa.previous_salary_grade}
          previousStep={nosa.previous_step}
          previousSalary={nosa.previous_salary}
          newSalaryGrade={nosa.new_salary_grade}
          newStep={nosa.new_step}
          newSalary={nosa.new_salary}
          reason={nosa.reason}
          legalBasis={nosa.legal_basis}
          effectiveDate={nosa.effective_date}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `NOSA-${nosa.employees?.employee_no ?? "record"}-${nosa.effective_date}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail
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

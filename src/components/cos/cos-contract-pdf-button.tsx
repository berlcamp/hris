"use client";

import { useState } from "react";
import { Printer, Loader2 } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CosContractPdf } from "@/components/pdf/cos-contract-pdf";
import type { CosContractWithEmployee } from "@/lib/actions/cos-contract-actions";
import type { MergeContext } from "@/lib/cos-merge-fields";
import { formatCosEmployeeName, toIsoDateString } from "@/lib/cos-constants";

interface CosContractPdfButtonProps {
  contract: CosContractWithEmployee;
}

export function CosContractPdfButton({ contract }: CosContractPdfButtonProps) {
  const [generating, setGenerating] = useState(false);
  const employee = contract.cos_employees;

  const handleGenerate = async () => {
    if (!employee) {
      toast.error("This contract has no employee record attached");
      return;
    }
    setGenerating(true);
    try {
      // Flattens the PostgREST join into the shape cos-merge-fields expects.
      // departmentName is the one rename: the join nests it under departments.
      const mergeContext: MergeContext = {
        employee: {
          first_name: employee.first_name,
          middle_name: employee.middle_name,
          last_name: employee.last_name,
          suffix: employee.suffix,
          cos_no: employee.cos_no,
          address: employee.address,
          departmentName: employee.departments?.name ?? null,
        },
        contract: {
          position_title: contract.position_title,
          monthly_rate: contract.monthly_rate,
          period_start: contract.period_start,
          period_end: contract.period_end,
          scope_of_work: contract.scope_of_work,
          signatory_name: contract.signatory_name,
          signatory_position: contract.signatory_position,
          witness_name: contract.witness_name,
          witness_position: contract.witness_position,
        },
        today: toIsoDateString(new Date()),
      };

      const blob = await pdf(
        <CosContractPdf
          body={contract.body}
          mergeContext={mergeContext}
          employeeName={formatCosEmployeeName(employee)}
        />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revoking immediately would race the new tab's load in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error(err);
      toast.error("Could not generate the contract PDF");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
      {generating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Printer className="h-4 w-4" />
      )}
      Print Contract
    </Button>
  );
}

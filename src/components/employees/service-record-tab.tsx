"use client";

import { format } from "date-fns";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ServiceRecord } from "@/lib/types";
import { generateServiceRecordPdf } from "@/lib/actions/document-actions";
import { ServiceRecordFormDialog } from "@/components/employees/service-record-form-dialog";
import { ServiceRecordRowActions } from "@/components/employees/service-record-row-actions";

function formatDate(value: string | null) {
  if (!value) return "Present";
  return format(new Date(value), "MMM d, yyyy");
}

function formatCurrency(value: number | null) {
  if (value == null) return "—";
  return `₱${Number(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
  })}`;
}

function formatGradeStep(
  grade: number | null,
  step: number | null
): string | null {
  if (grade == null && step == null) return null;
  if (grade != null && step != null) return `SG ${grade}-${step}`;
  if (grade != null) return `SG ${grade}`;
  return `Step ${step}`;
}

export function ServiceRecordTab({
  serviceRecords,
  employeeId,
  employeeName,
}: {
  serviceRecords: ServiceRecord[];
  employeeId: string;
  employeeName: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ServiceRecord | null>(null);

  const handleGeneratePdf = async () => {
    setGenerating(true);
    const result = await generateServiceRecordPdf(employeeId);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Service record PDF generated successfully.");
    }
    setGenerating(false);
  };

  const openAdd = () => {
    setEditRecord(null);
    setFormOpen(true);
  };

  const openEdit = (record: ServiceRecord) => {
    setEditRecord(record);
    setFormOpen(true);
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={openAdd}>
        <Plus className="h-4 w-4" />
        Add Record
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleGeneratePdf}
        disabled={generating}
      >
        <FileText className="h-4 w-4" />
        {generating ? "Generating..." : "Generate PDF"}
      </Button>
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Service Record</CardTitle>
          {headerActions}
        </CardHeader>
        <CardContent>
          {serviceRecords.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No service records yet. Click &quot;Add Record&quot; to create the
              first entry, or &quot;Generate PDF&quot; to produce a form from
              employment history.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SG / Step</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceRecords.map((record) => {
                  const gradeStep = formatGradeStep(
                    record.salary_grade,
                    record.step_increment
                  );
                  return (
                    <TableRow key={record.id}>
                      <TableCell>{formatDate(record.date_from)}</TableCell>
                      <TableCell>{formatDate(record.date_to)}</TableCell>
                      <TableCell className="font-medium">
                        {record.designation}
                      </TableCell>
                      <TableCell>{record.status_type ?? "—"}</TableCell>
                      <TableCell>
                        {gradeStep ? (
                          <Badge variant="outline">{gradeStep}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{formatCurrency(record.salary)}</TableCell>
                      <TableCell>
                        {record.office ?? "—"}
                        {record.agency ? (
                          <div className="text-xs text-muted-foreground">
                            {record.agency}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {record.remarks ?? "—"}
                      </TableCell>
                      <TableCell>
                        <ServiceRecordRowActions
                          record={record}
                          onEdit={openEdit}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ServiceRecordFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        employeeId={employeeId}
        employeeName={employeeName}
        record={editRecord}
      />
    </>
  );
}

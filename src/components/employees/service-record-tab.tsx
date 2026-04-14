"use client";

import { format } from "date-fns";
import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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

  if (serviceRecords.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Service Record</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGeneratePdf}
            disabled={generating}
          >
            <FileText className="h-4 w-4" />
            {generating ? "Generating..." : "Generate PDF"}
          </Button>
        </CardHeader>
        <CardContent className="py-10 text-center text-muted-foreground">
          No service records found. Click &quot;Generate PDF&quot; to create one
          from employment history.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Service Record</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGeneratePdf}
          disabled={generating}
        >
          <FileText className="h-4 w-4" />
          {generating ? "Generating..." : "Generate PDF"}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Salary</TableHead>
              <TableHead>Office</TableHead>
              <TableHead>Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {serviceRecords.map((record) => (
              <TableRow key={record.id}>
                <TableCell>
                  {format(new Date(record.date_from), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  {record.date_to
                    ? format(new Date(record.date_to), "MMM d, yyyy")
                    : "Present"}
                </TableCell>
                <TableCell className="font-medium">
                  {record.designation}
                </TableCell>
                <TableCell>{record.status_type ?? "—"}</TableCell>
                <TableCell>
                  {record.salary
                    ? `₱${record.salary.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}`
                    : "—"}
                </TableCell>
                <TableCell>{record.office ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {record.remarks ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

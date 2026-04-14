"use client";

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
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
import type { SalaryHistory } from "@/lib/types";

const reasonLabels: Record<string, string> = {
  initial: "Initial",
  step_increment: "Step Increment",
  promotion: "Promotion",
  reclassification: "Reclassification",
  salary_standardization: "Salary Standardization",
  adjustment: "Adjustment",
  demotion: "Demotion",
};

const reasonBadgeVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  initial: "outline",
  step_increment: "secondary",
  promotion: "default",
  reclassification: "secondary",
  salary_standardization: "secondary",
  adjustment: "outline",
  demotion: "destructive",
};

export function SalaryHistoryTab({
  salaryHistory,
}: {
  salaryHistory: SalaryHistory[];
}) {
  if (salaryHistory.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No salary history records found.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Salary History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Effective Date</TableHead>
              <TableHead>Salary Grade</TableHead>
              <TableHead>Step</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salaryHistory.map((record) => (
              <TableRow key={record.id}>
                <TableCell>
                  {format(new Date(record.effective_date), "MMM d, yyyy")}
                </TableCell>
                <TableCell>{record.salary_grade}</TableCell>
                <TableCell>{record.step}</TableCell>
                <TableCell>
                  {record.salary_amount > 0
                    ? `₱${record.salary_amount.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}`
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      reasonBadgeVariant[record.reason] ?? "outline"
                    }
                  >
                    {reasonLabels[record.reason] ?? record.reason}
                  </Badge>
                </TableCell>
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

"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportShell } from "./report-shell";

interface PlantillaItem {
  id: string;
  title: string;
  item_number: string | null;
  salary_grade: number;
  is_filled: boolean;
  departments: { name: string; code: string } | null;
  employees: { id: string; first_name: string; last_name: string; employee_no: string; status: string }[] | null;
}

interface PlantillaReportClientProps {
  data: PlantillaItem[];
}

export function PlantillaReportClient({ data }: PlantillaReportClientProps) {
  const toCsv = () => {
    const headers = ["Item No.", "Position", "SG", "Department", "Status", "Incumbent", "Employee No."];
    const rows = data.map((p) => {
      const dept = Array.isArray(p.departments) ? p.departments[0] : p.departments;
      const emp = p.employees?.[0];
      return [
        p.item_number ?? "",
        `"${p.title}"`,
        p.salary_grade,
        dept?.name ?? "",
        p.is_filled ? "Filled" : "Vacant",
        emp ? `"${emp.last_name}, ${emp.first_name}"` : "",
        emp?.employee_no ?? "",
      ].join(",");
    });
    return [headers.join(","), ...rows].join("\n");
  };

  const filled = data.filter((p) => p.is_filled).length;
  const vacant = data.length - filled;

  return (
    <ReportShell
      title="Plantilla Report"
      onExportCsv={toCsv}
      fileName="plantilla_report.csv"
      filters={
        <>
          <Badge variant="outline">Total: {data.length}</Badge>
          <Badge variant="default">Filled: {filled}</Badge>
          <Badge variant="secondary">Vacant: {vacant}</Badge>
        </>
      }
    >
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Item No.</TableHead>
              <TableHead className="text-xs">Position</TableHead>
              <TableHead className="text-xs text-center">SG</TableHead>
              <TableHead className="text-xs">Department</TableHead>
              <TableHead className="text-xs text-center">Status</TableHead>
              <TableHead className="text-xs">Incumbent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No positions found.
                </TableCell>
              </TableRow>
            ) : (
              data.map((p) => {
                const dept = (Array.isArray(p.departments) ? p.departments[0] : p.departments) as { name: string; code: string } | null;
                const emp = p.employees?.[0];
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs font-mono">
                      {p.item_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {p.title}
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      {p.salary_grade}
                    </TableCell>
                    <TableCell className="text-xs">
                      {dept?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={p.is_filled ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {p.is_filled ? "Filled" : "Vacant"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {emp ? (
                        <div>
                          <span className="font-medium">
                            {emp.last_name}, {emp.first_name}
                          </span>
                          <span className="text-muted-foreground ml-1 font-mono">
                            ({emp.employee_no})
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </ReportShell>
  );
}

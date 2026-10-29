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
import type { PositionItem } from "@/lib/position-summary";
import { ReportShell } from "./report-shell";

interface PlantillaReportClientProps {
  data: PositionItem[];
}

/** Incumbent's department when filled; the item's own unit when vacant. */
function itemDepartment(p: PositionItem): string {
  return p.employees?.departments?.name ?? p.organizational_unit ?? "";
}

function incumbentName(p: PositionItem): string {
  return p.employees ? `${p.employees.last_name}, ${p.employees.first_name}` : "";
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function PlantillaReportClient({ data }: PlantillaReportClientProps) {
  const items = [...data].sort(
    (a, b) =>
      (b.salary_grade ?? -1) - (a.salary_grade ?? -1) ||
      (a.item_number ?? "").localeCompare(b.item_number ?? "", undefined, { numeric: true }),
  );

  const toCsv = () => {
    const headers = ["Item No.", "Position", "SG", "Department", "Status", "Incumbent"];
    const rows = items.map((p) =>
      [
        csvField(p.item_number ?? ""),
        csvField(p.position_title ?? ""),
        p.salary_grade ?? "",
        csvField(itemDepartment(p)),
        p.is_vacant ? "Vacant" : "Filled",
        csvField(incumbentName(p)),
      ].join(","),
    );
    return [headers.join(","), ...rows].join("\n");
  };

  const vacant = items.filter((p) => p.is_vacant).length;
  const filled = items.length - vacant;

  return (
    <ReportShell
      title="Plantilla Report"
      onExportCsv={toCsv}
      fileName="plantilla_report.csv"
      filters={
        <>
          <Badge variant="outline">Total: {items.length}</Badge>
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
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No positions found.
                </TableCell>
              </TableRow>
            ) : (
              items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs font-mono">
                    {p.item_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {p.position_title ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-center">
                    {p.salary_grade ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {itemDepartment(p) || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={p.is_vacant ? "secondary" : "default"}
                      className="text-xs"
                    >
                      {p.is_vacant ? "Vacant" : "Filled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.employees ? (
                      <span className="font-medium">{incumbentName(p)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </ReportShell>
  );
}

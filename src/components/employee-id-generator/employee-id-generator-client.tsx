"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { extractFullNameColumn, parseCsvTextToRows } from "@/lib/parse-csv";
import {
  matchSearchedNamesToEmployees,
  type EmployeeIdMatchRow,
} from "@/lib/actions/employee-id-generator-actions";

export function EmployeeIdGeneratorClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<EmployeeIdMatchRow[]>([]);
  const [pending, setPending] = useState(false);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file.");
      return;
    }
    setPending(true);
    try {
      const text = await file.text();
      const parsed = parseCsvTextToRows(text);
      const names = extractFullNameColumn(parsed);
      if (names.length === 0) {
        toast.error("No names found. Use one column (full names) or a header like “Full Name”.");
        setRows([]);
        return;
      }
      const matched = await matchSearchedNamesToEmployees(names);
      setRows(matched);
      const found = matched.filter((r) => r.employeeId).length;
      toast.success(`Processed ${matched.length} row(s); ${found} matched.`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to process CSV.");
      setRows([]);
    } finally {
      setPending(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import CSV</CardTitle>
          <CardDescription>
            CSC-style export: one column of employee full names (optionally with a header such as
            “Full Name”). Names are matched to records you can access in Employees.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-upload">CSV file</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => fileInputRef.current?.click()}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span className="ml-2">Choose CSV</span>
              </Button>
              <input
                ref={fileInputRef}
                id="csv-upload"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                tabIndex={-1}
                disabled={pending}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void processFile(f);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              Searched Name, Matched Name (HRIS format), and database id for mapping.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Searched Name</TableHead>
                    <TableHead>Matched Name</TableHead>
                    <TableHead className="w-[340px] font-mono text-xs">employee.id</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.searchedName}-${i}`}>
                      <TableCell className="font-medium">{r.searchedName}</TableCell>
                      <TableCell className={r.matchedName ? "" : "text-muted-foreground"}>
                        {r.matchedName ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs break-all">
                        {r.employeeId ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

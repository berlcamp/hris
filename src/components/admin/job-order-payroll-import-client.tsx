"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  importJobOrderPayrollCsv,
  type JobOrderPayrollImportResult,
} from "@/lib/actions/job-order-payroll-import-actions";

function ListSection({
  title,
  items,
  render,
  emptyClassName,
}: {
  title: string;
  items: string[] | { legacy_id: string; reason: string }[];
  render: (item: string | { legacy_id: string; reason: string }) => string;
  emptyClassName: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={`font-medium ${emptyClassName}`}>
        {title} ({items.length})
      </p>
      <ul className="mt-1 max-h-64 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-muted-foreground">
        {items.map((item, i) => (
          <li key={i}>{render(item)}</li>
        ))}
      </ul>
    </div>
  );
}

function ImportResultSummary({ result }: { result: JobOrderPayrollImportResult }) {
  return (
    <div className="space-y-3 rounded-md border p-4 text-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        <p>
          Payrolls created: <span className="font-medium">{result.payrollsCreated}</span>
        </p>
        <p>
          Payrolls updated: <span className="font-medium">{result.payrollsUpdated}</span>
        </p>
        <p>
          Skipped (empty): <span className="font-medium">{result.payrollsSkippedEmpty}</span>
        </p>
        <p>
          Payrolls isolated: <span className="font-medium">{result.payrollsIsolated.length}</span>
        </p>
        <p>
          Members created: <span className="font-medium">{result.membersCreated}</span>
        </p>
        <p>
          Members updated: <span className="font-medium">{result.membersUpdated}</span>
        </p>
        <p>
          Unresolved members: <span className="font-medium">{result.unresolvedMembers.length}</span>
        </p>
      </div>

      <ListSection
        title="Isolated payrolls — reported, not imported"
        items={result.payrollsIsolated}
        emptyClassName="text-destructive"
        render={(item) => {
          const r = item as { legacy_id: string; reason: string };
          return `legacy_id ${r.legacy_id}: ${r.reason}`;
        }}
      />

      <ListSection
        title="Unresolved members — no matching Job Order employee"
        items={result.unresolvedMembers}
        emptyClassName="text-destructive"
        render={(item) => {
          const r = item as { legacy_id: string; reason: string };
          return `legacy_id ${r.legacy_id}: ${r.reason}`;
        }}
      />

      <ListSection
        title="Warnings"
        items={result.warnings}
        emptyClassName="text-amber-600 dark:text-amber-500"
        render={(item) => item as string}
      />
    </div>
  );
}

export function JobOrderPayrollImportClient() {
  const payrollsInputRef = useRef<HTMLInputElement>(null);
  const membersInputRef = useRef<HTMLInputElement>(null);
  const [payrollsFile, setPayrollsFile] = useState<File | null>(null);
  const [membersFile, setMembersFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<JobOrderPayrollImportResult | null>(null);

  const runImport = useCallback(async () => {
    if (!payrollsFile || !membersFile) {
      toast.error("Please choose both CSV files first.");
      return;
    }
    setPending(true);
    setResult(null);
    try {
      const [payrollsCsv, membersCsv] = await Promise.all([
        payrollsFile.text(),
        membersFile.text(),
      ]);
      const res = await importJobOrderPayrollCsv(payrollsCsv, membersCsv);
      setResult(res);
      if (res.payrollsCreated === 0 && res.payrollsUpdated === 0) {
        toast.error("Import produced no saved payrolls — see the summary below.");
      } else {
        toast.success(
          `Created ${res.payrollsCreated} payroll(s), updated ${res.payrollsUpdated}; ${res.membersCreated} member(s) created.`,
        );
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setPending(false);
    }
  }, [payrollsFile, membersFile]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Legacy payroll history</CardTitle>
        <CardDescription>
          Columns (legacy <code className="text-xs">jopayrolls</code>): id, from, to, days, areas,
          description, particulars, deleted_at, created_at, updated_at. Columns (legacy{" "}
          <code className="text-xs">jopayroll_members</code>): id, jopayroll_id, jo_id, days,
          hours, weekends, holidays, deleted_at, created_at, updated_at. Every imported payroll is
          marked <em>Reconstructed</em> — the legacy system had no rate column on payroll members,
          so migrated amounts are priced at each employee&apos;s current rate. Rows are upserted on
          the legacy id, so re-running this import updates existing rows rather than duplicating
          them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Payrolls CSV (jopayrolls.csv)</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={payrollsInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => setPayrollsFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => payrollsInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {payrollsFile ? payrollsFile.name : "Choose file"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Members CSV (jopayroll_members.csv)</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={membersInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => setMembersFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => membersInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {membersFile ? membersFile.name : "Choose file"}
              </Button>
            </div>
          </div>
        </div>

        <Button
          type="button"
          disabled={pending || !payrollsFile || !membersFile}
          onClick={() => void runImport()}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Import
        </Button>

        {result && <ImportResultSummary result={result} />}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, Trash2, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

import {
  createSalaryGradeEntry,
  updateSalaryGradeEntry,
  deleteSalaryGradeEntry,
  bulkImportSalaryGrades,
} from "@/lib/actions/salary-grade-actions";

interface SalaryGradeEntry {
  id: string;
  grade: number;
  step: number;
  amount: number;
  tranche: number;
  effective_year: number;
}

interface SalaryGradeManagerProps {
  initialGrades: SalaryGradeEntry[];
  tranches: { tranche: number; effective_year: number }[];
}

export function SalaryGradeManager({ initialGrades, tranches }: SalaryGradeManagerProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [filterTranche, setFilterTranche] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<SalaryGradeEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importPreview, setImportPreview] = useState<{ grade: number; step: number; amount: number; tranche: number; effective_year: number }[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [formGrade, setFormGrade] = useState(1);
  const [formStep, setFormStep] = useState(1);
  const [formAmount, setFormAmount] = useState(0);
  const [formTranche, setFormTranche] = useState(1);
  const [formYear, setFormYear] = useState(new Date().getFullYear());

  const filtered = filterTranche === "all"
    ? initialGrades
    : initialGrades.filter((g) => g.tranche === Number(filterTranche));

  const resetForm = () => {
    setFormGrade(1);
    setFormStep(1);
    setFormAmount(0);
    setFormTranche(1);
    setFormYear(new Date().getFullYear());
  };

  const openEdit = (entry: SalaryGradeEntry) => {
    setFormGrade(entry.grade);
    setFormStep(entry.step);
    setFormAmount(entry.amount);
    setFormTranche(entry.tranche);
    setFormYear(entry.effective_year);
    setEditEntry(entry);
  };

  const handleSave = async () => {
    setLoading(true);
    const input = { grade: formGrade, step: formStep, amount: formAmount, tranche: formTranche, effective_year: formYear };

    const result = editEntry
      ? await updateSalaryGradeEntry(editEntry.id, input)
      : await createSalaryGradeEntry(input);

    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success(editEntry ? "Entry updated." : "Entry added.");
      setAddOpen(false);
      setEditEntry(null);
      resetForm();
      router.refresh();
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setLoading(true);
    const result = await deleteSalaryGradeEntry(deleteId);
    if ("error" in result && result.error) toast.error(result.error);
    else { toast.success("Entry deleted."); router.refresh(); }
    setLoading(false);
    setDeleteId(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split("\n");
      const entries: typeof importPreview = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
        if (cols.length >= 5) {
          entries.push({
            grade: Number(cols[0]),
            step: Number(cols[1]),
            amount: Number(cols[2]),
            tranche: Number(cols[3]),
            effective_year: Number(cols[4]),
          });
        }
      }
      setImportPreview(entries);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (importPreview.length === 0) return;
    setImporting(true);
    setImportProgress(50);
    const result = await bulkImportSalaryGrades(importPreview);
    setImportProgress(100);
    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Imported ${result.count} entries.`);
      setImportOpen(false);
      setImportPreview([]);
      router.refresh();
    }
    setImporting(false);
    setImportProgress(0);
  };

  const formDialog = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editEntry ? "Edit Entry" : "Add Entry"}</DialogTitle>
        <DialogDescription>
          {editEntry ? "Update the salary grade table entry." : "Add a new salary grade/step/amount entry."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Grade</Label>
          <Input type="number" min={1} max={33} value={formGrade} onChange={(e) => setFormGrade(Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Step</Label>
          <Input type="number" min={1} max={8} value={formStep} onChange={(e) => setFormStep(Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Amount (₱)</Label>
          <Input type="number" step="0.01" min={0} value={formAmount} onChange={(e) => setFormAmount(Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Tranche</Label>
          <Input type="number" min={1} value={formTranche} onChange={(e) => setFormTranche(Number(e.target.value))} />
        </div>
        <div className="space-y-2 col-span-2">
          <Label>Effective Year</Label>
          <Input type="number" min={2000} value={formYear} onChange={(e) => setFormYear(Number(e.target.value))} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => { setAddOpen(false); setEditEntry(null); resetForm(); }}>Cancel</Button>
        <Button onClick={handleSave} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {editEntry ? "Update" : "Add"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterTranche} onValueChange={(v) => setFilterTranche(v ?? "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by tranche" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tranches</SelectItem>
            {tranches.map((t) => (
              <SelectItem key={t.tranche} value={String(t.tranche)}>
                Tranche {t.tranche} ({t.effective_year})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger render={<Button variant="outline" size="sm" />}>
            <Upload className="h-4 w-4" />
            Bulk Import CSV
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Bulk Import Salary Grades</DialogTitle>
              <DialogDescription>
                Upload a CSV with columns: grade, step, amount, tranche, effective_year
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Select CSV File
                </Button>
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
              </div>
              {importPreview.length > 0 && (
                <ScrollArea className="max-h-[300px] border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Grade</TableHead>
                        <TableHead>Step</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Tranche</TableHead>
                        <TableHead>Year</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.slice(0, 50).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{row.grade}</TableCell>
                          <TableCell>{row.step}</TableCell>
                          <TableCell>₱{row.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell>{row.tranche}</TableCell>
                          <TableCell>{row.effective_year}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {importPreview.length > 50 && (
                    <p className="text-xs text-muted-foreground p-2 text-center">
                      Showing 50 of {importPreview.length} rows
                    </p>
                  )}
                </ScrollArea>
              )}
              {importing && <Progress value={importProgress} className="h-2" />}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setImportOpen(false); setImportPreview([]); }}>Cancel</Button>
              <Button onClick={handleImport} disabled={importing || importPreview.length === 0}>
                {importing ? "Importing..." : `Import ${importPreview.length} Entries`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="h-4 w-4" />
            Add Entry
          </DialogTrigger>
          {formDialog}
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Salary Grade Entries
            <Badge variant="secondary">{filtered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No salary grade entries found. Add entries manually or import via CSV.
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grade</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Tranche</TableHead>
                    <TableHead>Effective Year</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.grade}</TableCell>
                      <TableCell>{entry.step}</TableCell>
                      <TableCell>
                        ₱{Number(entry.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">Tranche {entry.tranche}</Badge>
                      </TableCell>
                      <TableCell>{entry.effective_year}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Dialog open={editEntry?.id === entry.id} onOpenChange={(open) => { if (!open) { setEditEntry(null); resetForm(); } }}>
                            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(entry)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {editEntry?.id === entry.id && formDialog}
                          </Dialog>
                          <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(entry.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this salary grade entry? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={loading}
              className="bg-destructive/10 text-destructive hover:bg-destructive/20"
            >
              {loading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

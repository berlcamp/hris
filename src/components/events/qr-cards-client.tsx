"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Printer, RotateCcw } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  QrCardsPdf,
  cardCode,
  type QrCardPrintItem,
} from "@/components/pdf/qr-cards-pdf";
import {
  getQrCardSubjects,
  markQrCardsPrinted,
  rotateQrCredential,
} from "@/lib/actions/qr-card-actions";
import { EMPLOYMENT_LABELS } from "@/lib/event-repo";
import type { EventSubjectKind, QrCardSubject } from "@/lib/types";

const KINDS: EventSubjectKind[] = ["employee", "job_order", "cos"];

export function QrCardsClient({
  departments,
  areas,
  organizationName,
}: {
  departments: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  organizationName: string;
}) {
  const [kinds, setKinds] = useState<EventSubjectKind[]>(["employee"]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<QrCardSubject[]>([]);
  const [search, setSearch] = useState("");
  const [loading, startLoad] = useTransition();
  const [printing, setPrinting] = useState(false);

  const needsDepartments = kinds.includes("employee") || kinds.includes("cos");
  const needsAreas = kinds.includes("job_order");

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const load = () => {
    startLoad(async () => {
      const rows = await getQrCardSubjects({
        kinds,
        departmentIds,
        areaIds,
      });
      setSubjects(rows);
      if (rows.length === 0) toast.info("Nobody matches those filters.");
    });
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) => s.full_name.toLowerCase().includes(q));
  }, [search, subjects]);

  const handlePrint = async () => {
    if (visible.length === 0) return;
    setPrinting(true);
    try {
      // QR images are rendered here rather than on the server: they are pure
      // functions of the token, and shipping several hundred PNG data URLs
      // through a server action would blow the body size limit.
      const cards: QrCardPrintItem[] = await Promise.all(
        visible.map(async (s) => ({
          full_name: s.full_name,
          id_number: s.id_number,
          group_name: s.group_name,
          employment_label: s.employment_label,
          token: s.token,
          qrDataUrl: await QRCode.toDataURL(s.token, {
            width: 512,
            margin: 1,
            // High correction: these cards live in wallets and get creased.
            errorCorrectionLevel: "H",
          }),
        })),
      );

      const blob = await pdf(
        <QrCardsPdf cards={cards} organizationName={organizationName} />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `qr-id-cards-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      const result = await markQrCardsPrinted(visible.map((s) => s.token));
      if (result.success) {
        toast.success(`${visible.length} card${visible.length === 1 ? "" : "s"} generated`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate the cards.");
    }
    setPrinting(false);
  };

  const handleRotate = async (subject: QrCardSubject) => {
    const result = await rotateQrCredential(
      subject.subject_kind,
      subject.subject_id,
      "Card reissued",
    );
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setSubjects((rows) =>
      rows.map((r) =>
        r.subject_id === subject.subject_id && r.subject_kind === subject.subject_kind
          ? { ...r, token: result.data!.token }
          : r,
      ),
    );
    toast.success("New code issued — the old card no longer scans. Reprint it.");
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border p-4">
        <div className="space-y-2">
          <Label className="text-xs">Personnel type</Label>
          <div className="flex flex-wrap gap-4">
            {KINDS.map((kind) => (
              <label key={kind} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={kinds.includes(kind)}
                  onCheckedChange={() => setKinds((k) => toggle(k, kind))}
                />
                {EMPLOYMENT_LABELS[kind]}
              </label>
            ))}
          </div>
        </div>

        {needsDepartments && (
          <div className="space-y-2">
            <Label className="text-xs">
              Departments{" "}
              <span className="text-muted-foreground font-normal">
                — Plantilla and COS. Leave empty for all.
              </span>
            </Label>
            <ScrollArea className="h-28 rounded-md border p-2">
              <div className="grid grid-cols-2 gap-1">
                {departments.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={departmentIds.includes(d.id)}
                      onCheckedChange={() => setDepartmentIds((v) => toggle(v, d.id))}
                    />
                    <span className="truncate">{d.name}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {needsAreas && (
          <div className="space-y-2">
            <Label className="text-xs">
              Areas{" "}
              <span className="text-muted-foreground font-normal">
                — Job Order personnel have no department; they are filtered by
                area.
              </span>
            </Label>
            <ScrollArea className="h-28 rounded-md border p-2">
              <div className="grid grid-cols-2 gap-1">
                {areas.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={areaIds.includes(a.id)}
                      onCheckedChange={() => setAreaIds((v) => toggle(v, a.id))}
                    />
                    <span className="truncate">{a.name}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <Button size="sm" onClick={load} disabled={loading || kinds.length === 0}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Load personnel
        </Button>
      </div>

      {subjects.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name"
              className="max-w-xs"
            />
            <Badge variant="outline">{visible.length} card(s)</Badge>
            <span className="text-muted-foreground text-xs">
              {Math.ceil(visible.length / 10)} A4 sheet(s), 10 per sheet
            </span>
            <div className="ml-auto">
              <Button size="sm" onClick={() => void handlePrint()} disabled={printing}>
                {printing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                Generate PDF
              </Button>
            </div>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Card code</TableHead>
                  <TableHead>Department / Area</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Reissue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((s) => (
                  <TableRow key={`${s.subject_kind}:${s.subject_id}`}>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell className="font-mono text-xs">{cardCode(s)}</TableCell>
                    <TableCell>{s.group_name ?? "—"}</TableCell>
                    <TableCell>{s.employment_label}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRotate(s)}
                        title="Issue a new code — the old card stops working"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

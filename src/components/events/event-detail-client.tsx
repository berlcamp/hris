"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { Lock, LockOpen, Pencil, ScanLine, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ExportCsvButton } from "@/components/tables/export-csv-button";
import { EventFormDialog } from "@/components/events/event-form-dialog";
import { EventRosterBuilder } from "@/components/events/event-roster-builder";
import { deleteEvent, setEventStatus } from "@/lib/actions/event-actions";
import type {
  EventAttendanceRecord,
  EventRecord,
  EventRosterEntry,
} from "@/lib/types";

function fmtDate(d: string): string {
  return format(new Date(`${d}T00:00:00`), "MMM d, yyyy");
}

export function EventDetailClient({
  event,
  roster,
  attendance,
  departments,
  areas,
  orphanedLegacyCount,
  canDelete,
}: {
  event: EventRecord;
  roster: EventRosterEntry[];
  attendance: EventAttendanceRecord[];
  departments: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  orphanedLegacyCount: number;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Every day the event runs, so an empty day still shows as a column. */
  const days = useMemo(() => {
    const out: string[] = [];
    const cursor = new Date(`${event.start_date}T00:00:00`);
    const end = new Date(`${event.end_date}T00:00:00`);
    while (cursor <= end) {
      out.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [event.start_date, event.end_date]);

  const presentByDay = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of attendance) {
      const key = `${a.subject_kind}:${a.subject_id}`;
      if (!map.has(a.attendance_date)) map.set(a.attendance_date, new Set());
      map.get(a.attendance_date)!.add(key);
    }
    return map;
  }, [attendance]);

  const amendments = attendance.filter((a) => a.synced_late);
  const manualEntries = attendance.filter((a) => a.method === "manual");
  const walkIns = attendance.filter((a) => a.is_walk_in);

  const csvRows = useMemo(
    () =>
      attendance.map((a) => ({
        date: a.attendance_date,
        name: a.full_name,
        type: a.subject_kind,
        method: a.method,
        walk_in: a.is_walk_in ? "yes" : "no",
        amendment: a.synced_late ? "yes" : "no",
        scanned_at: a.scanned_at,
      })),
    [attendance],
  );

  const changeStatus = async (status: "draft" | "open" | "closed") => {
    setBusy(true);
    const result = await setEventStatus(event.id, status);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Event ${status}`);
    router.refresh();
  };

  const handleDelete = async () => {
    const result = await deleteEvent(event.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Event deleted");
    router.push("/events");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {event.title}
            </h1>
            <Badge variant={event.status === "open" ? "default" : "secondary"}>
              {event.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {event.start_date === event.end_date
              ? fmtDate(event.start_date)
              : `${fmtDate(event.start_date)} – ${fmtDate(event.end_date)}`}
            {event.venue ? ` · ${event.venue}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {event.status === "open" && (
            <Link href={`/scan/${event.id}`}>
              <Button variant="outline" size="sm">
                <ScanLine className="h-4 w-4" />
                Open scanner
              </Button>
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {event.status !== "open" ? (
            <Button size="sm" disabled={busy} onClick={() => void changeStatus("open")}>
              <LockOpen className="h-4 w-4" />
              Open for scanning
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void changeStatus("closed")}
            >
              <Lock className="h-4 w-4" />
              Close event
            </Button>
          )}
          {canDelete && (
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {event.description && (
        <p className="text-muted-foreground text-sm">{event.description}</p>
      )}

      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Roster ({roster.length})</TabsTrigger>
          <TabsTrigger value="attendance">
            Attendance ({attendance.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="space-y-4">
          <EventRosterBuilder
            eventId={event.id}
            departments={departments}
            areas={areas}
            orphanedLegacyCount={orphanedLegacyCount}
            rosterCount={roster.length}
            disabled={event.status === "closed"}
          />

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>ID No.</TableHead>
                  <TableHead>Department / Area</TableHead>
                  <TableHead>Type</TableHead>
                  {days.map((d) => (
                    <TableHead key={d} className="text-center whitespace-nowrap">
                      {format(new Date(`${d}T00:00:00`), "MMM d")}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4 + days.length} className="h-24 text-center">
                      No roster yet. Build one above.
                    </TableCell>
                  </TableRow>
                ) : (
                  roster.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell>{r.id_number ?? "—"}</TableCell>
                      <TableCell>{r.group_name ?? "—"}</TableCell>
                      <TableCell>{r.employment_label}</TableCell>
                      {days.map((d) => (
                        <TableCell key={d} className="text-center">
                          {presentByDay
                            .get(d)
                            ?.has(`${r.subject_kind}:${r.subject_id}`)
                            ? "✓"
                            : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{attendance.length} recorded</Badge>
            {walkIns.length > 0 && (
              <Badge variant="secondary">{walkIns.length} walk-in</Badge>
            )}
            {manualEntries.length > 0 && (
              <Badge variant="secondary">{manualEntries.length} manual</Badge>
            )}
            {amendments.length > 0 && (
              <Badge variant="secondary">{amendments.length} amendment</Badge>
            )}
            <div className="ml-auto">
              <ExportCsvButton
                data={csvRows}
                filename={`event-attendance-${event.id.slice(0, 8)}`}
                columns={[
                  { key: "date", header: "Date" },
                  { key: "name", header: "Name" },
                  { key: "type", header: "Type" },
                  { key: "method", header: "Method" },
                  { key: "walk_in", header: "Walk-in" },
                  { key: "amendment", header: "Amendment" },
                  { key: "scanned_at", header: "Scanned at" },
                ]}
              />
            </div>
          </div>

          {amendments.length > 0 && (
            <p className="text-muted-foreground text-xs">
              {amendments.length} record
              {amendments.length === 1 ? "" : "s"} arrived after this event was
              closed — queued on a device that was offline. They are shown as
              amendments so a report already printed stays explainable.
            </p>
          )}

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      Nothing recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  attendance.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">
                        {fmtDate(a.attendance_date)}
                      </TableCell>
                      <TableCell className="font-medium">{a.full_name}</TableCell>
                      <TableCell>
                        <Badge variant={a.method === "manual" ? "secondary" : "outline"}>
                          {a.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-1">
                        {a.is_walk_in && <Badge variant="secondary">walk-in</Badge>}
                        {a.synced_late && <Badge variant="secondary">amendment</Badge>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <EventFormDialog open={editOpen} onOpenChange={setEditOpen} event={event} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              The roster and every attendance record recorded against it go with
              it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CameraOff,
  CheckCircle2,
  CloudOff,
  Loader2,
  RefreshCw,
  ScanLine,
  TriangleAlert,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQrScanner } from "@/components/events/use-qr-scanner";
import {
  cacheEventPayload,
  dequeueScans,
  enqueueScan,
  getCachedEvent,
  getCachedRoster,
  getQueue,
  lookupToken,
  offlineStorageAvailable,
  type QueuedScan,
} from "@/lib/event-scan-queue";
import {
  getEventScanPayload,
  submitEventScans,
} from "@/lib/actions/event-scan-actions";
import { recordManualAttendance } from "@/lib/actions/event-actions";
import { manilaDateOf } from "@/lib/format-date";
import type { EventRecord, EventScanRosterEntry } from "@/lib/types";

/** Matches the token shape minted by migration 081 and qr-card-actions. */
const TOKEN_PATTERN = /^H[0-9A-F]{20}$/;

/** Ignore repeat reads of the same card within this window (ms). */
const RESCAN_COOLDOWN_MS = 2500;

type Feedback = {
  kind: "ok" | "duplicate" | "walk_in" | "reject";
  title: string;
  detail?: string;
};

export function EventScannerClient({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [roster, setRoster] = useState<EventScanRosterEntry[]>([]);
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [history, setHistory] = useState<{ name: string; at: string }[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [bootError, setBootError] = useState<string | null>(null);

  // Tokens already accepted on THIS device, so the officer gets an instant
  // "already scanned" instead of waiting for a sync round trip to say so.
  const seenRef = useRef<Set<string>>(new Set());
  const lastReadRef = useRef<{ token: string; at: number } | null>(null);

  const refreshQueue = useCallback(async () => {
    if (!offlineStorageAvailable()) return;
    setQueue(await getQueue(eventId));
  }, [eventId]);

  // ── Boot: register the worker, then hydrate from the network or the cache ──
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Scope /events/ rather than / — see public/events-scan-sw.js for why the
    // worker must never control the rest of this application.
    navigator.serviceWorker
      .register("/events-scan-sw.js", { scope: "/events/" })
      .catch(() => {
        // No worker means no offline reload. Scanning and queueing still work
        // for as long as the tab stays open, so this is not fatal.
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!offlineStorageAvailable()) {
        setBootError(
          "This browser has no offline storage, so scans cannot be queued. Use a different browser.",
        );
        setLoading(false);
        return;
      }

      // Cache first, so the scanner is usable within a frame of opening even on
      // a dead connection; the network refresh below then corrects it.
      const cached = await getCachedEvent(eventId);
      if (cached && !cancelled) {
        setEvent(cached.event);
        setRoster(await getCachedRoster(eventId));
      }
      await refreshQueue();

      try {
        const payload = await getEventScanPayload(eventId);
        if (cancelled) return;
        if (payload) {
          await cacheEventPayload(payload.event, payload.roster);
          setEvent(payload.event);
          setRoster(payload.roster);
        } else if (!cached) {
          setBootError(
            "This event is not open for scanning, or you do not have access to it.",
          );
        }
      } catch {
        if (!cached && !cancelled) {
          setBootError(
            "Could not load the event and nothing is cached on this device. Connect once, then you can work offline.",
          );
        }
      }
      if (!cancelled) setLoading(false);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [eventId, refreshQueue]);

  // ── Connectivity ──────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const sync = useCallback(async () => {
    if (syncing) return;
    const pending = await getQueue(eventId);
    if (pending.length === 0) return;

    setSyncing(true);
    try {
      // Batched at the schema's cap so a queue built over a long offline stint
      // still drains.
      const BATCH = 500;
      for (let i = 0; i < pending.length; i += BATCH) {
        const slice = pending.slice(i, i + BATCH);
        const result = await submitEventScans({
          event_id: eventId,
          scans: slice.map((s) => ({
            client_scan_id: s.client_scan_id,
            token: s.token,
            scanned_at: s.scanned_at,
          })),
        });
        if (!result.success) {
          setFeedback({ kind: "reject", title: "Sync failed", detail: result.error });
          break;
        }
        // A duplicate is accounted for — the record already exists — so it must
        // leave the queue too, or the queue never drains. Only a transient
        // 'error' is kept for the next attempt.
        const settled = result.results
          .filter((r) => r.outcome !== "error")
          .map((r) => r.client_scan_id);
        await dequeueScans(settled);

        const problems = result.results.filter(
          (r) => r.outcome === "unknown_token" || r.outcome === "out_of_range",
        );
        if (problems.length > 0) {
          setFeedback({
            kind: "reject",
            title: `${problems.length} scan${problems.length === 1 ? "" : "s"} rejected`,
            detail: problems[0].message ?? undefined,
          });
        }
      }
    } finally {
      setSyncing(false);
      await refreshQueue();
    }
  }, [eventId, refreshQueue, syncing]);

  // Flush whenever the connection comes back.
  useEffect(() => {
    if (online && queue.length > 0 && !syncing) void sync();
    // Intentionally not depending on `sync` identity: it changes with `syncing`
    // and would re-enter mid-flush.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, queue.length]);

  // ── Scanning ──────────────────────────────────────────────────────────────
  const handleDecode = useCallback(
    async (raw: string) => {
      const token = raw.trim().toUpperCase();
      const now = Date.now();

      // The camera reads the same card many times a second while it is in
      // frame; without this every card would fill the queue.
      const last = lastReadRef.current;
      if (last && last.token === token && now - last.at < RESCAN_COOLDOWN_MS) return;
      lastReadRef.current = { token, at: now };

      if (!TOKEN_PATTERN.test(token)) {
        setFeedback({
          kind: "reject",
          title: "Not an attendance card",
          detail:
            "That QR is something else — the employee profile code, or a code from another system.",
        });
        return;
      }

      if (seenRef.current.has(token)) {
        setFeedback({ kind: "duplicate", title: "Already scanned" });
        return;
      }

      const entry = await lookupToken(eventId, token);
      const scannedAt = new Date().toISOString();
      const clientScanId = `${eventId}-${token}-${scannedAt}`;

      await enqueueScan({
        client_scan_id: clientScanId,
        event_id: eventId,
        token,
        scanned_at: scannedAt,
        full_name: entry?.full_name ?? null,
      });
      seenRef.current.add(token);
      await refreshQueue();

      if (entry) {
        setFeedback({
          kind: "ok",
          title: entry.full_name,
          detail: [entry.group_name, entry.employment_label].filter(Boolean).join(" · "),
        });
        setHistory((h) => [{ name: entry.full_name, at: scannedAt }, ...h].slice(0, 50));
      } else {
        // Not on this event's roster — recorded as a walk-in, never refused.
        // Offline the name cannot be resolved; the server fills it in on sync.
        setFeedback({
          kind: "walk_in",
          title: "Recorded — not on the roster",
          detail: "Saved as a walk-in. The name is filled in when this syncs.",
        });
        setHistory((h) => [{ name: "Walk-in", at: scannedAt }, ...h].slice(0, 50));
      }

      if (navigator.onLine) void sync();
    },
    [eventId, refreshQueue, sync],
  );

  const scanner = useQrScanner((value) => void handleDecode(value));

  const manualMatches = useMemo(() => {
    const q = manualQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return roster
      .filter((r) => r.full_name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [manualQuery, roster]);

  const handleManual = useCallback(
    async (entry: EventScanRosterEntry) => {
      if (!navigator.onLine) {
        setFeedback({
          kind: "reject",
          title: "Manual entry needs a connection",
          detail: "Scan the card if you can, or add this person once you are back online.",
        });
        return;
      }
      const result = await recordManualAttendance({
        event_id: eventId,
        subject_kind: entry.subject_kind,
        subject_id: entry.subject_id,
        attendance_date: manilaDateOf(new Date()),
      });
      if (result.success) {
        setFeedback({
          kind: "ok",
          title: entry.full_name,
          detail: "Recorded manually — no card scanned.",
        });
        setHistory((h) =>
          [{ name: `${entry.full_name} (manual)`, at: new Date().toISOString() }, ...h].slice(0, 50),
        );
        setManualQuery("");
        setManualOpen(false);
      } else {
        setFeedback({ kind: "reject", title: "Not recorded", detail: result.error });
      }
    },
    [eventId],
  );

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <TriangleAlert className="text-muted-foreground h-8 w-8" />
        <p className="text-sm">{bootError}</p>
        <Link href="/events">
          <Button variant="outline" size="sm">
            Back to events
          </Button>
        </Link>
      </div>
    );
  }

  const feedbackTone =
    feedback?.kind === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10"
      : feedback?.kind === "walk_in"
        ? "border-amber-500/40 bg-amber-500/10"
        : feedback?.kind === "duplicate"
          ? "border-sky-500/40 bg-sky-500/10"
          : "border-destructive/40 bg-destructive/10";

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-3 p-3">
      <header className="flex items-center gap-2">
        <Link href="/events" aria-label="Back to events" className="shrink-0">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{event?.title ?? "Event"}</p>
          <p className="text-muted-foreground truncate text-xs">
            {roster.length} on the roster
          </p>
        </div>
        {online ? (
          <Badge variant="outline" className="shrink-0 gap-1 text-xs">
            Online
          </Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
            <CloudOff className="h-3 w-3" /> Offline
          </Badge>
        )}
      </header>

      <div className="bg-muted relative aspect-square overflow-hidden rounded-lg">
        <video
          ref={scanner.videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
        />
        <canvas ref={scanner.canvasRef} className="hidden" />
        {scanner.state !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {scanner.state === "error" ? (
              <>
                <CameraOff className="text-muted-foreground h-8 w-8" />
                <p className="text-xs">{scanner.error}</p>
              </>
            ) : (
              <ScanLine className="text-muted-foreground h-8 w-8" />
            )}
            <Button
              size="sm"
              onClick={() => void scanner.start()}
              disabled={scanner.state === "starting"}
            >
              {scanner.state === "starting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Start camera
            </Button>
          </div>
        )}
      </div>

      {feedback && (
        <div className={`rounded-lg border p-3 ${feedbackTone}`}>
          <p className="flex items-center gap-2 text-sm font-semibold">
            {feedback.kind === "ok" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <TriangleAlert className="h-4 w-4" />
            )}
            {feedback.title}
          </p>
          {feedback.detail && (
            <p className="text-muted-foreground mt-1 text-xs">{feedback.detail}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Badge variant={queue.length > 0 ? "secondary" : "outline"} className="text-xs">
          {queue.length} queued
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void sync()}
          disabled={syncing || queue.length === 0 || !online}
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Sync
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setManualOpen((v) => !v)}
        >
          <UserPlus className="h-4 w-4" />
          No card
        </Button>
      </div>

      {manualOpen && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">
            Forgotten or unreadable card. Recorded as a manual entry and flagged
            as such in the report.
          </p>
          <Input
            value={manualQuery}
            onChange={(e) => setManualQuery(e.target.value)}
            placeholder="Search the roster by name"
            autoComplete="off"
          />
          <ScrollArea className="max-h-48">
            <div className="space-y-1">
              {manualMatches.map((entry) => (
                <button
                  key={`${entry.subject_kind}:${entry.subject_id}`}
                  type="button"
                  onClick={() => void handleManual(entry)}
                  className="hover:bg-muted w-full rounded-md p-2 text-left text-sm"
                >
                  <span className="block truncate font-medium">{entry.full_name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {[entry.group_name, entry.employment_label].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))}
              {manualQuery.trim().length >= 2 && manualMatches.length === 0 && (
                <p className="text-muted-foreground p-2 text-xs">No match on this roster.</p>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium">This session</p>
          <ScrollArea className="max-h-56">
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={`${h.at}-${i}`} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="truncate">{h.name}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

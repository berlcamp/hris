"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CameraOff,
  CheckCircle2,
  CloudOff,
  Flashlight,
  Loader2,
  RefreshCw,
  ScanLine,
  Search,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQrScanner } from "@/components/events/use-qr-scanner";
import {
  cacheEventPayload,
  dequeueScans,
  enqueueScan,
  getCachedEvent,
  getCachedRoster,
  getQueue,
  lookupToken,
  newScanId,
  offlineStorageAvailable,
  repairQueueIds,
  type QueuedScan,
} from "@/lib/event-scan-queue";
import {
  getEventScanPayload,
  submitEventScans,
} from "@/lib/actions/event-scan-actions";
import { recordManualAttendance } from "@/lib/actions/event-actions";
import { accentForEvent } from "@/lib/event-accent";
import { manilaDateOf } from "@/lib/format-date";
import { primeScanFeedback, playScanFeedback } from "@/lib/scan-feedback";
import { registerScannerWorker } from "@/lib/scanner-pwa";
import type { EventRecord, EventScanRosterEntry } from "@/lib/types";

/** Matches the token shape minted by migration 081 and qr-card-actions. */
const TOKEN_PATTERN = /^H[0-9A-F]{20}$/;

/** Ignore repeat reads of the same card within this window (ms). */
const RESCAN_COOLDOWN_MS = 2500;

type FeedbackKind = "ok" | "duplicate" | "walk_in" | "reject";

type Feedback = {
  kind: FeedbackKind;
  title: string;
  detail?: string;
  /** Bumped on every scan so a repeat of the same result still re-animates. */
  seq: number;
};

/**
 * The signal colours, matched to --signal-* in globals.css. Held as literals
 * rather than composed at runtime because Tailwind cannot see a class name
 * built from a variable.
 */
const TONE: Record<FeedbackKind, { ring: string; chip: string; text: string }> = {
  ok: {
    ring: "border-[oklch(0.75_0.17_152/0.9)]",
    chip: "bg-[oklch(0.75_0.17_152/0.16)] text-[oklch(0.85_0.15_152)]",
    text: "text-[oklch(0.88_0.14_152)]",
  },
  walk_in: {
    ring: "border-[oklch(0.80_0.15_80/0.9)]",
    chip: "bg-[oklch(0.80_0.15_80/0.16)] text-[oklch(0.87_0.13_80)]",
    text: "text-[oklch(0.88_0.13_80)]",
  },
  duplicate: {
    ring: "border-[oklch(0.72_0.13_235/0.9)]",
    chip: "bg-[oklch(0.72_0.13_235/0.16)] text-[oklch(0.82_0.12_235)]",
    text: "text-[oklch(0.84_0.12_235)]",
  },
  reject: {
    ring: "border-[oklch(0.66_0.20_22/0.9)]",
    chip: "bg-[oklch(0.66_0.20_22/0.18)] text-[oklch(0.80_0.17_22)]",
    text: "text-[oklch(0.80_0.17_22)]",
  },
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
  const [manualSaving, setManualSaving] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  // Tokens already accepted on THIS device, so the officer gets an instant
  // "already scanned" instead of waiting for a sync round trip to say so.
  const seenRef = useRef<Set<string>>(new Set());
  const lastReadRef = useRef<{ token: string; at: number } | null>(null);
  const feedbackSeq = useRef(0);

  const accent = accentForEvent(eventId);

  const say = useCallback(
    (kind: FeedbackKind, title: string, detail?: string) => {
      feedbackSeq.current += 1;
      setFeedback({ kind, title, detail, seq: feedbackSeq.current });
      playScanFeedback(kind);
    },
    [],
  );

  const refreshQueue = useCallback(async () => {
    if (!offlineStorageAvailable()) return;
    setQueue(await getQueue(eventId));
  }, [eventId]);

  // ── Boot: register the worker, then hydrate from the network or the cache ──
  useEffect(() => {
    void registerScannerWorker();
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
      // Rekeys scans queued by a build whose ids were too long to validate.
      // Without this they never leave the device.
      await repairQueueIds(eventId);
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
          say("reject", "Sync failed", result.error);
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
          say(
            "reject",
            `${problems.length} scan${problems.length === 1 ? "" : "s"} rejected`,
            problems[0].message ?? undefined,
          );
        }
      }
    } finally {
      setSyncing(false);
      await refreshQueue();
    }
  }, [eventId, refreshQueue, say, syncing]);

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
        say(
          "reject",
          "Not an attendance card",
          "That QR is something else — the employee profile code, or a code from another system.",
        );
        return;
      }

      if (seenRef.current.has(token)) {
        say("duplicate", "Already scanned", "This card was recorded on this device.");
        return;
      }

      const entry = await lookupToken(eventId, token);
      const scannedAt = new Date().toISOString();
      const clientScanId = newScanId();

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
        say(
          "ok",
          entry.full_name,
          [entry.group_name, entry.employment_label].filter(Boolean).join(" · "),
        );
        setHistory((h) => [{ name: entry.full_name, at: scannedAt }, ...h].slice(0, 50));
      } else {
        // Not on this event's roster — recorded as a walk-in, never refused.
        // Offline the name cannot be resolved; the server fills it in on sync.
        say(
          "walk_in",
          "Recorded — not on the roster",
          "Saved as a walk-in. The name is filled in when this syncs.",
        );
        setHistory((h) => [{ name: "Walk-in", at: scannedAt }, ...h].slice(0, 50));
      }

      if (navigator.onLine) void sync();
    },
    [eventId, refreshQueue, say, sync],
  );

  const scanner = useQrScanner((value) => void handleDecode(value));

  // Open the camera the moment the event is loaded. An officer with a queue
  // forming in front of them should not have to find a button first; the manual
  // Start below is the fallback for the browsers that refuse without a tap.
  const startCamera = scanner.start;
  useEffect(() => {
    if (loading || bootError) return;
    void startCamera();
  }, [loading, bootError, startCamera]);

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
        say(
          "reject",
          "Manual entry needs a connection",
          "Scan the card if you can, or add this person once you are back online.",
        );
        return;
      }
      setManualSaving(true);
      const result = await recordManualAttendance({
        event_id: eventId,
        subject_kind: entry.subject_kind,
        subject_id: entry.subject_id,
        attendance_date: manilaDateOf(new Date()),
      });
      setManualSaving(false);
      if (result.success) {
        say("ok", entry.full_name, "Recorded manually — no card scanned.");
        setHistory((h) =>
          [{ name: `${entry.full_name} (manual)`, at: new Date().toISOString() }, ...h].slice(0, 50),
        );
        setManualQuery("");
        setManualOpen(false);
      } else {
        say("reject", "Not recorded", result.error);
      }
    },
    [eventId, say],
  );

  if (loading) {
    return (
      <div className="checker-ground flex min-h-svh flex-col items-center justify-center gap-3">
        <Loader2 className="text-primary h-7 w-7 animate-spin" />
        <p className="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase">
          Opening event
        </p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="checker-ground mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="bg-card grid h-14 w-14 place-items-center rounded-2xl">
          <TriangleAlert className="text-muted-foreground h-6 w-6" />
        </span>
        <p className="text-sm">{bootError}</p>
        {/* A hard navigation, not next/link: the client-side transition would
            fetch an RSC payload over a connection the venue may not have,
            whereas a plain navigation is a request the service worker can
            answer from its cache. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/scan">
          <Button variant="outline" size="lg" className="rounded-full">
            <ArrowLeft className="h-4 w-4" />
            All events
          </Button>
        </a>
      </div>
    );
  }

  const tone = feedback ? TONE[feedback.kind] : null;

  return (
    <div
      style={{ "--evt": accent } as React.CSSProperties}
      className="checker-ground relative flex min-h-svh flex-col"
      // The first touch anywhere is what unlocks audio on iOS and Chrome; the
      // Start button alone would leave an auto-started camera beeping silently.
      onPointerDown={primeScanFeedback}
    >
      {/* ── Viewfinder. Fills the screen; every control floats over it. ── */}
      <div className="absolute inset-0 overflow-hidden">
        <video
          ref={scanner.videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
        />
        <canvas ref={scanner.canvasRef} className="hidden" />
        {/* Vignette: heavy behind the header and the result banner, where white
            text has to stay readable over a sunlit tiled floor, and nearly
            clear across the middle band, which is the part the officer is
            actually aiming with. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.16_0.028_258/0.88)_0%,oklch(0.16_0.028_258/0.12)_20%,oklch(0.16_0.028_258/0.12)_55%,oklch(0.16_0.028_258/0.94)_82%)]" />
      </div>

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/scan" aria-label="All events" className="shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="bg-card/70 h-11 w-11 rounded-full backdrop-blur-sm"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </a>
        <div className="bg-card/70 min-w-0 flex-1 rounded-2xl px-3.5 py-2 backdrop-blur-sm">
          <p className="truncate text-sm leading-tight font-semibold">
            {event?.title ?? "Event"}
          </p>
          <p className="text-muted-foreground truncate font-mono text-[0.65rem] tracking-wider uppercase">
            {roster.length} on roster · {history.length} scanned here
          </p>
        </div>
        {scanner.torchAvailable && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={scanner.torchOn ? "Turn the light off" : "Turn the light on"}
            aria-pressed={scanner.torchOn}
            onClick={() => void scanner.toggleTorch()}
            className={`h-11 w-11 shrink-0 rounded-full backdrop-blur-sm ${
              scanner.torchOn
                ? "bg-primary text-primary-foreground hover:bg-primary"
                : "bg-card/70"
            }`}
          >
            <Flashlight className="h-5 w-5" />
          </Button>
        )}
      </header>

      {/* ── Reticle ── */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-10">
        <div className="relative aspect-square w-full max-w-[17rem]">
          {(["left-0 top-0 border-l-3 border-t-3 rounded-tl-2xl",
             "right-0 top-0 border-r-3 border-t-3 rounded-tr-2xl",
             "left-0 bottom-0 border-l-3 border-b-3 rounded-bl-2xl",
             "right-0 bottom-0 border-r-3 border-b-3 rounded-br-2xl"] as const).map(
            (corner) => (
              <span
                key={corner}
                className={`absolute h-12 w-12 border-[oklch(0.85_0.13_var(--evt))] ${corner}`}
              />
            ),
          )}
          {scanner.state === "running" && (
            <span className="checker-sweep absolute inset-x-4 top-1/2 h-px bg-[oklch(0.85_0.13_var(--evt))] shadow-[0_0_14px_2px_oklch(0.85_0.13_var(--evt)/0.7)]" />
          )}
        </div>

        {scanner.state !== "running" && (
          <div className="bg-background/85 absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-8 text-center backdrop-blur-sm">
            {scanner.state === "error" ? (
              <>
                <CameraOff className="text-muted-foreground h-8 w-8" />
                <p className="max-w-xs text-sm">{scanner.error}</p>
              </>
            ) : (
              <ScanLine className="text-muted-foreground h-8 w-8" />
            )}
            <Button
              size="lg"
              className="h-13 rounded-full px-8 text-base"
              onClick={() => {
                primeScanFeedback();
                void scanner.start();
              }}
              disabled={scanner.state === "starting"}
            >
              {scanner.state === "starting" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : null}
              Start camera
            </Button>
          </div>
        )}
      </div>

      {/* ── Result ── */}
      <div className="relative z-10 min-h-[6.5rem] px-4">
        {feedback && tone ? (
          <div
            key={feedback.seq}
            role="status"
            aria-live="polite"
            className={`checker-result bg-card/90 rounded-2xl border-2 p-4 backdrop-blur-md ${tone.ring}`}
          >
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone.chip}`}>
                {feedback.kind === "ok" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <TriangleAlert className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0">
                <p className={`text-lg leading-tight font-bold text-balance ${tone.text}`}>
                  {feedback.title}
                </p>
                {feedback.detail && (
                  <p className="text-muted-foreground mt-1 text-xs">{feedback.detail}</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground pt-7 text-center font-mono text-xs tracking-[0.2em] uppercase">
            Point at the QR on the card
          </p>
        )}
      </div>

      {/* ── Action bar ── */}
      <footer className="relative z-10 flex items-center gap-2 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <span
          className={`flex h-12 items-center gap-2 rounded-full border px-4 font-mono text-xs ${
            online
              ? "border-[oklch(0.75_0.17_152/0.4)] bg-[oklch(0.75_0.17_152/0.12)] text-[oklch(0.85_0.14_152)]"
              : "border-[oklch(0.80_0.15_80/0.4)] bg-[oklch(0.80_0.15_80/0.12)] text-[oklch(0.87_0.13_80)]"
          }`}
        >
          {online ? (
            <span className="h-2 w-2 rounded-full bg-current" />
          ) : (
            <CloudOff className="h-4 w-4" />
          )}
          {queue.length > 0 ? `${queue.length} unsent` : online ? "Synced" : "Offline"}
        </span>

        {queue.length > 0 && (
          <Button
            variant="outline"
            size="lg"
            aria-label="Sync queued scans"
            onClick={() => void sync()}
            disabled={syncing || !online}
            className="bg-card/70 h-12 w-12 shrink-0 rounded-full p-0 backdrop-blur-sm"
          >
            {syncing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <RefreshCw className="h-5 w-5" />
            )}
          </Button>
        )}

        <Button
          size="lg"
          variant="secondary"
          onClick={() => setManualOpen(true)}
          className="ml-auto h-12 rounded-full px-5 text-sm"
        >
          <UserPlus className="h-5 w-5" />
          No card
        </Button>
      </footer>

      {manualOpen && (
        <ManualSheet
          query={manualQuery}
          onQueryChange={setManualQuery}
          matches={manualMatches}
          saving={manualSaving}
          online={online}
          onPick={(entry) => void handleManual(entry)}
          onClose={() => setManualOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * The fallback for a forgotten, lost or unreadable card.
 *
 * A full-height sheet rather than a panel wedged under the viewfinder: this is
 * a search-and-pick task done with the phone held up, and it needs the keyboard
 * and a long list of names more than it needs the camera behind it. The
 * recorded entry is flagged `manual` in the report either way — see
 * recordManualAttendance.
 */
function ManualSheet({
  query,
  onQueryChange,
  matches,
  saving,
  online,
  onPick,
  onClose,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  matches: EventScanRosterEntry[];
  saving: boolean;
  online: boolean;
  onPick: (entry: EventScanRosterEntry) => void;
  onClose: () => void;
}) {
  return (
    <div className="bg-background/95 fixed inset-0 z-50 flex flex-col backdrop-blur-md">
      <div className="flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Record without a card</p>
          <p className="text-muted-foreground text-xs">
            Flagged as a manual entry in the report.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onClose}
          className="h-11 w-11 rounded-full"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search the roster by name"
            autoComplete="off"
            autoFocus
            className="h-13 rounded-2xl pl-10 text-base"
          />
        </div>
        {!online && (
          <p className="mt-2 font-mono text-[0.7rem] text-[oklch(0.87_0.13_80)]">
            Offline — a manual entry needs a connection. Scan the card if you can.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="space-y-1.5">
          {matches.map((entry) => (
            <button
              key={`${entry.subject_kind}:${entry.subject_id}`}
              type="button"
              disabled={saving}
              onClick={() => onPick(entry)}
              className="border-border/60 bg-card active:bg-accent w-full rounded-2xl border p-4 text-left disabled:opacity-60"
            >
              <span className="block truncate font-medium">{entry.full_name}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {[entry.id_number, entry.group_name, entry.employment_label]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          ))}
          {query.trim().length >= 2 && matches.length === 0 && (
            <p className="text-muted-foreground py-10 text-center text-sm">
              No match on this roster. Scan the card to record them as a walk-in.
            </p>
          )}
          {query.trim().length < 2 && (
            <p className="text-muted-foreground py-10 text-center text-sm">
              Type at least two letters of the name.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

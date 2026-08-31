"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarX2,
  CameraOff,
  ChartColumn,
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
  getEventTurnout,
  submitEventScans,
  type EventTurnout,
} from "@/lib/actions/event-scan-actions";
import { recordManualAttendance } from "@/lib/actions/event-actions";
import { accentForEvent } from "@/lib/event-accent";
import { formatManilaLongDate, manilaDateOf } from "@/lib/format-date";
import { primeScanFeedback, playScanFeedback } from "@/lib/scan-feedback";
import { registerScannerWorker } from "@/lib/scanner-pwa";
import type { EventRecord, EventScanRosterEntry } from "@/lib/types";

/** Matches the token shape minted by migration 081 and qr-card-actions. */
const TOKEN_PATTERN = /^H[0-9A-F]{20}$/;

/** Ignore repeat reads of the same card within this window (ms). */
const RESCAN_COOLDOWN_MS = 2500;

/**
 * Why a scan taken right now could not be recorded, or null if it can be.
 *
 * The server refuses any scan whose Manila date falls outside the event's own
 * days (submitEventScans) — but it refuses it at SYNC, which can be hours after
 * the officer has walked away from the door, and the refusal takes the scan
 * with it. Checking the same rule here turns a morning silently lost at sync
 * into a refusal the officer can still do something about: the wrong event
 * opened, the event moved, or a phone whose own clock is wrong.
 *
 * Deliberately a plain function of (event, today) rather than a hook: the
 * banner reads it once per event, and each scan re-reads it against a freshly
 * taken date, so a scanner left open across midnight does not keep answering
 * with yesterday's.
 */
function offEventDayDetail(event: EventRecord | null, today: string): string | null {
  if (!event) return null;
  if (today >= event.start_date && today <= event.end_date) return null;
  const runs =
    event.start_date === event.end_date
      ? formatManilaLongDate(event.start_date)
      : `${formatManilaLongDate(event.start_date)} to ${formatManilaLongDate(event.end_date)}`;
  return `${event.title} runs ${runs}, and this phone says today is ${formatManilaLongDate(today)}. Check the date on the phone if that is wrong.`;
}

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
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState<EventTurnout | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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

      // Checked before the card is even read: on a day the event does not run,
      // no card can be recorded, so refusing here beats queueing a scan the
      // server will throw away at sync.
      const offDay = offEventDayDetail(event, manilaDateOf(new Date()));
      if (offDay) {
        say("reject", "Not an event day", offDay);
        return;
      }

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
    [event, eventId, refreshQueue, say, sync],
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
      const offDay = offEventDayDetail(event, manilaDateOf(new Date()));
      if (offDay) {
        say("reject", "Not an event day", offDay);
        return;
      }
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
    [event, eventId, say],
  );

  /**
   * Turnout by CSC team, counted on the server.
   *
   * The queue is flushed first when there is anything in it: an officer who has
   * just scanned twenty people and then opens the summary must not be shown a
   * total that is twenty short and left wondering which is wrong.
   */
  const loadSummary = useCallback(async () => {
    if (!navigator.onLine) {
      setSummaryError(
        "Offline — the summary is counted on the server, across every phone at the door. It loads when the connection is back.",
      );
      return;
    }
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      if ((await getQueue(eventId)).length > 0) await sync();
      const data = await getEventTurnout(eventId);
      if (!data) {
        setSummaryError("This event's summary is not available to this account.");
      } else {
        setSummary(data);
      }
    } catch {
      setSummaryError("Could not load the summary. Try again.");
    } finally {
      setSummaryLoading(false);
    }
  }, [eventId, sync]);

  const openSummary = useCallback(() => {
    setSummaryOpen(true);
    void loadSummary();
  }, [loadSummary]);

  /** Non-null when today is not one of the event's days — see offEventDayDetail. */
  const dayNotice = useMemo(
    () => offEventDayDetail(event, manilaDateOf(new Date())),
    [event],
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
        {/* The title block is the summary button. The action bar below has no
            room left for a fourth control on a 360px phone, and the counts are
            what someone reaches for when they want the fuller picture anyway. */}
        <button
          type="button"
          onClick={openSummary}
          aria-label="View attendance summary by CSC team"
          className="bg-card/70 active:bg-card/90 flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-3.5 py-2 text-left backdrop-blur-sm"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm leading-tight font-semibold">
              {event?.title ?? "Event"}
            </span>
            <span className="text-muted-foreground block truncate font-mono text-[0.65rem] tracking-wider uppercase">
              {roster.length} on roster · {history.length} scanned here
            </span>
          </span>
          <ChartColumn className="text-muted-foreground h-5 w-5 shrink-0" />
        </button>
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

      {/* ── Wrong day ── */}
      {dayNotice && (
        <div className="relative z-10 mx-3 mt-2 flex items-start gap-2.5 rounded-2xl border border-[oklch(0.66_0.20_22/0.5)] bg-[oklch(0.66_0.20_22/0.18)] px-3.5 py-2.5 backdrop-blur-sm">
          <CalendarX2 className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.80_0.17_22)]" />
          <p className="text-[0.72rem] leading-snug text-[oklch(0.86_0.10_22)]">
            <span className="font-semibold">Nothing can be recorded today.</span>{" "}
            {dayNotice}
          </p>
        </div>
      )}

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

      {summaryOpen && (
        <SummarySheet
          summary={summary}
          loading={summaryLoading}
          error={summaryError}
          unsent={queue.length}
          onRefresh={() => void loadSummary()}
          onClose={() => setSummaryOpen(false)}
        />
      )}

      {manualOpen && (
        <ManualSheet
          query={manualQuery}
          onQueryChange={setManualQuery}
          matches={manualMatches}
          saving={manualSaving}
          online={online}
          offDay={dayNotice}
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
  offDay,
  onPick,
  onClose,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  matches: EventScanRosterEntry[];
  saving: boolean;
  online: boolean;
  /** Set when today is not one of the event's days; nothing can be recorded. */
  offDay: string | null;
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
        {offDay ? (
          // Said here as well as on the scanner screen: the sheet covers the
          // result banner, so an officer who reached for "No card" would
          // otherwise tap a name and get no visible answer.
          <p className="mt-2 text-[0.7rem] leading-snug text-[oklch(0.80_0.17_22)]">
            Nothing can be recorded today. {offDay}
          </p>
        ) : (
          !online && (
            <p className="mt-2 font-mono text-[0.7rem] text-[oklch(0.87_0.13_80)]">
              Offline — a manual entry needs a connection. Scan the card if you can.
            </p>
          )
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="space-y-1.5">
          {matches.map((entry) => (
            <button
              key={`${entry.subject_kind}:${entry.subject_id}`}
              type="button"
              disabled={saving || offDay !== null}
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

/**
 * Turnout by CSC team — the door's read-only view of the same numbers the
 * events report shows HR.
 *
 * People, not scans: a person who came all three days of an event is one in
 * every number here. `roster` is the denominator, so a team that has not turned
 * up at all still gets a row reading 0 — the zero is the point.
 *
 * On a day outside the event the per-day number would be a column of zeroes
 * that reads as a failure, so the sheet leads with the whole-event total
 * instead and says why.
 */
function SummarySheet({
  summary,
  loading,
  error,
  unsent,
  onRefresh,
  onClose,
}: {
  summary: EventTurnout | null;
  loading: boolean;
  error: string | null;
  unsent: number;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const todayIsTheColumn = summary?.in_range ?? false;

  return (
    <div className="bg-background/95 fixed inset-0 z-50 flex flex-col backdrop-blur-md">
      <div className="flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Attendance summary</p>
          <p className="text-muted-foreground truncate text-xs">
            By CSC team{summary ? ` · ${summary.title}` : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh the summary"
          onClick={onRefresh}
          disabled={loading}
          className="h-11 w-11 rounded-full"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <RefreshCw className="h-5 w-5" />
          )}
        </Button>
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

      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {error && (
          <div className="border-border/60 bg-card rounded-2xl border p-4">
            <p className="text-sm">{error}</p>
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={loading}
              className="mt-3 rounded-full"
            >
              Try again
            </Button>
          </div>
        )}

        {!error && !summary && loading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Loader2 className="text-primary h-6 w-6 animate-spin" />
            <p className="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase">
              Counting
            </p>
          </div>
        )}

        {summary && (
          <>
            {/* Headline: present, out of the roster. */}
            <div className="border-border/60 bg-card rounded-2xl border p-4">
              <p className="text-muted-foreground font-mono text-[0.65rem] tracking-wider uppercase">
                {todayIsTheColumn
                  ? `Present ${formatManilaLongDate(summary.date)}`
                  : "Present over the whole event"}
              </p>
              <p className="mt-1 text-3xl leading-none font-bold tabular-nums">
                {todayIsTheColumn ? summary.today_total : summary.event_total}
                <span className="text-muted-foreground text-base font-medium">
                  {" "}
                  of {summary.roster_total}
                </span>
              </p>
              {todayIsTheColumn && summary.multi_day && (
                <p className="text-muted-foreground mt-1.5 text-xs">
                  {summary.event_total} different people over the event so far.
                </p>
              )}
              {!todayIsTheColumn && (
                <p className="mt-1.5 text-xs text-[oklch(0.80_0.17_22)]">
                  Today is not one of this event&apos;s days, so there is no
                  count for today.
                </p>
              )}
              {unsent > 0 && (
                <p className="mt-1.5 text-xs text-[oklch(0.87_0.13_80)]">
                  {unsent} scan{unsent === 1 ? "" : "s"} still on this phone are
                  not in these numbers yet.
                </p>
              )}
            </div>

            <div className="mt-3 space-y-1.5">
              {summary.rows.length === 0 ? (
                <p className="text-muted-foreground py-10 text-center text-sm">
                  Nobody is on this event&apos;s roster yet.
                </p>
              ) : (
                summary.rows.map((row) => {
                  const present = todayIsTheColumn ? row.today : row.total;
                  const pct =
                    row.roster > 0
                      ? Math.min(100, Math.round((present / row.roster) * 100))
                      : present > 0
                        ? 100
                        : 0;
                  return (
                    <div
                      key={row.team ?? "__unassigned"}
                      className="border-border/60 bg-card rounded-2xl border p-3.5"
                    >
                      <div className="flex items-baseline gap-3">
                        <span
                          className={`min-w-0 flex-1 truncate text-sm font-medium ${
                            row.team === null ? "text-muted-foreground italic" : ""
                          }`}
                        >
                          {row.team ?? "No team assigned"}
                        </span>
                        <span className="shrink-0 font-mono text-sm tabular-nums">
                          {present}
                          <span className="text-muted-foreground">
                            {row.roster > 0 ? ` / ${row.roster}` : " · walk-ins"}
                          </span>
                        </span>
                      </div>
                      <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full bg-[oklch(0.75_0.17_152)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {todayIsTheColumn && summary.multi_day && (
                        <p className="text-muted-foreground mt-1.5 font-mono text-[0.65rem] tracking-wider uppercase">
                          {row.total} over the event
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <p className="text-muted-foreground mt-4 text-[0.7rem] leading-relaxed">
              Counted as people, not scans — somebody who came on two days
              counts once. Teams are read from the personnel registry, so a
              correction there moves these numbers.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

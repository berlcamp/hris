"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  CloudOff,
  Download,
  Loader2,
  LogOut,
  RefreshCw,
  ScanLine,
  Share,
  Users,
  WifiOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth-actions";
import { getScannableEvents } from "@/lib/actions/event-scan-actions";
import {
  accentForEvent,
  eventDayPosition,
  formatEventDateRange,
  isRunningToday,
} from "@/lib/event-accent";
import {
  cacheScannableEvents,
  getCachedScannableEvents,
  getQueueCountsByEvent,
  offlineStorageAvailable,
} from "@/lib/event-scan-queue";
import { manilaDateOf } from "@/lib/format-date";
import { registerScannerWorker, warmScanRoutes } from "@/lib/scanner-pwa";
import type { ScannableEvent } from "@/lib/types";

/**
 * The Attendance Checker's home screen: every open event as a card, one tap
 * from its scanner.
 *
 * Renders entirely on the client. The page beneath it ships no personnel data
 * in its HTML — see (scanner)/layout.tsx — because that HTML is cached by a
 * service worker on a phone that may be shared between officers.
 *
 * Cache first, then network. At a venue the connection is the least reliable
 * thing in the room, so the list the officer saw last is on screen before the
 * fetch is even issued, and the fetch only ever corrects it.
 */
export function CheckerHomeClient() {
  const [events, setEvents] = useState<ScannableEvent[]>([]);
  const [queued, setQueued] = useState<Map<string, number>>(new Map());
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const today = manilaDateOf(new Date());

  const load = useCallback(async (opts: { showSpinner: boolean }) => {
    if (opts.showSpinner) setRefreshing(true);
    try {
      const fresh = await getScannableEvents();
      setEvents(fresh);
      setFromCache(false);
      if (offlineStorageAvailable()) {
        await cacheScannableEvents(fresh);
        setCachedAt(new Date().toISOString());
      }
      // While there is still signal, put each event's scanner page in the
      // worker's cache. Without it, the FIRST time an event is opened at a dead
      // venue is a blank screen — the page is a URL the cache has never seen.
      void warmScanRoutes(fresh.map((e) => e.id));
    } catch {
      // Offline, or the session expired while the phone was in a pocket. The
      // cached list is already on screen; saying so is more use than an error.
      setFromCache(true);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void registerScannerWorker();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (offlineStorageAvailable()) {
        const cached = await getCachedScannableEvents();
        if (!cancelled && cached.events.length > 0) {
          setEvents(cached.events);
          setCachedAt(cached.cached_at);
          setFromCache(true);
          setLoading(false);
        }
        if (!cancelled) setQueued(await getQueueCountsByEvent());
      }
      if (!cancelled) await load({ showSpinner: false });
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [load]);

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

  const pendingTotal = [...queued.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="checker-ground min-h-svh pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <header className="px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-primary font-mono text-[0.65rem] tracking-[0.28em] uppercase">
              Attendance Checker
            </p>
            <h1 className="mt-1.5 text-[1.75rem] leading-none font-bold tracking-tight">
              {loading ? "Loading…" : `${events.length} open event${events.length === 1 ? "" : "s"}`}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Tap an event to start scanning cards.
            </p>
          </div>
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              className="text-muted-foreground h-11 w-11 rounded-full"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </form>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusPill online={online} />
          {pendingTotal > 0 && (
            <span className="border-border/70 bg-card flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs">
              <CloudOff className="h-3.5 w-3.5" />
              {pendingTotal} unsent
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load({ showSpinner: true })}
            disabled={refreshing}
            className="text-muted-foreground ml-auto h-9 rounded-full px-3"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </header>

      <main className="px-5 pt-5">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-card/60 h-36 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <EmptyState online={online} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {events.map((event, i) => (
              <EventCard
                key={event.id}
                event={event}
                today={today}
                pending={queued.get(event.id) ?? 0}
                index={i}
              />
            ))}
          </div>
        )}

        {fromCache && cachedAt && events.length > 0 && (
          <p className="text-muted-foreground mt-5 text-center font-mono text-[0.7rem]">
            Showing the list saved at{" "}
            {new Date(cachedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
            . Counts update when you reconnect.
          </p>
        )}

        <InstallHint />
      </main>
    </div>
  );
}

function StatusPill({ online }: { online: boolean }) {
  return (
    <span
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs ${
        online
          ? "border-[oklch(0.75_0.17_152/0.45)] bg-[oklch(0.75_0.17_152/0.12)] text-[oklch(0.85_0.14_152)]"
          : "border-border bg-card text-muted-foreground"
      }`}
    >
      {online ? (
        <>
          <span className="h-2 w-2 rounded-full bg-current" />
          Online
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          Offline — scans are saved
        </>
      )}
    </span>
  );
}

/**
 * One event.
 *
 * A plain anchor, not next/link, and deliberately so: a client-side transition
 * fetches an RSC payload over the network, which is exactly what a venue does
 * not have. A full navigation is a request the service worker can answer out of
 * its cache, so the scanner opens with the phone in airplane mode.
 */
function EventCard({
  event,
  today,
  pending,
  index,
}: {
  event: ScannableEvent;
  today: string;
  pending: number;
  index: number;
}) {
  const hue = accentForEvent(event.id);
  const running = isRunningToday(event, today);
  const position = running ? eventDayPosition(event, today) : null;

  return (
    <a
      href={`/scan/${event.id}`}
      style={{ "--evt": hue, animationDelay: `${index * 55}ms` } as React.CSSProperties}
      className="checker-card checker-rise border-border/60 bg-card active:border-[oklch(0.72_0.16_var(--evt)/0.7)] relative block overflow-hidden rounded-2xl border p-5 transition-transform active:scale-[0.985]"
    >
      {/* The accent rule. The one element on the card that is pure colour. */}
      <span className="absolute inset-y-0 left-0 w-1 bg-[oklch(0.72_0.16_var(--evt))]" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.65rem] tracking-[0.2em] text-[oklch(0.80_0.13_var(--evt))] uppercase">
            {formatEventDateRange(event.start_date, event.end_date)}
            {position && position.total > 1 && ` · Day ${position.day} of ${position.total}`}
          </p>
          <h2 className="mt-1.5 text-lg leading-snug font-semibold tracking-tight text-balance">
            {event.title}
          </h2>
          {event.venue && (
            <p className="text-muted-foreground mt-1 truncate text-sm">{event.venue}</p>
          )}
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[oklch(0.72_0.16_var(--evt)/0.16)] text-[oklch(0.82_0.14_var(--evt))]">
          <ScanLine className="h-5 w-5" />
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-2xl leading-none font-bold text-[oklch(0.85_0.13_var(--evt))]">
            {event.attendance_today}
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" />
            {/* A roster of zero is not an error — an event can be scanned
                walk-in only, and saying "of 0" would read as one. */}
            {event.roster_count > 0
              ? `in today, of ${event.roster_count} expected`
              : "in today · no roster"}
          </span>
        </span>
        {pending > 0 && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-[oklch(0.80_0.15_80/0.16)] px-2.5 py-1 font-mono text-[0.7rem] text-[oklch(0.85_0.13_80)]">
            <CloudOff className="h-3 w-3" />
            {pending} unsent
          </span>
        )}
      </div>

      {running && (
        <span className="text-primary-foreground bg-primary absolute top-0 right-0 rounded-bl-xl px-2.5 py-1 font-mono text-[0.6rem] tracking-[0.18em] uppercase">
          Today
        </span>
      )}
    </a>
  );
}

function EmptyState({ online }: { online: boolean }) {
  return (
    <div className="border-border/60 mt-6 rounded-2xl border border-dashed px-6 py-14 text-center">
      <span className="bg-card mx-auto grid h-14 w-14 place-items-center rounded-2xl">
        {online ? (
          <ScanLine className="text-muted-foreground h-6 w-6" />
        ) : (
          <WifiOff className="text-muted-foreground h-6 w-6" />
        )}
      </span>
      <p className="mt-4 font-semibold">
        {online ? "No events are open" : "Nothing saved on this phone"}
      </p>
      <p className="text-muted-foreground mx-auto mt-2 max-w-xs text-sm">
        {online
          ? "An event appears here the moment HR opens it for scanning. Pull Refresh when you are told it is ready."
          : "Connect once so the open events and their rosters download. After that the app works with no signal at all."}
      </p>
    </div>
  );
}

/**
 * The install prompt.
 *
 * Android fires beforeinstallprompt and gives a real button. iOS Safari fires
 * nothing and never will, so it gets the Share → Add to Home Screen wording
 * instead of a button that would do nothing. Both are hidden once the app is
 * already running standalone, which is the whole point of the exercise.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/**
 * "How is this page being displayed, and on what" — read through
 * useSyncExternalStore rather than an effect.
 *
 * Both facts are browser-only, and the server has no way to know either. The
 * server snapshot is "standalone", which renders nothing: a prompt that flashes
 * up in the server HTML and then vanishes on hydration is worse than one that
 * appears a frame late.
 */
type InstallSurface = "standalone" | "ios" | "other";

function subscribeDisplayMode(onChange: () => void): () => void {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readInstallSurface(): InstallSurface {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own, non-standard flag.
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (standalone) return "standalone";
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "other";
}

function serverInstallSurface(): InstallSurface {
  return "standalone";
}

function InstallHint() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const surface = useSyncExternalStore(
    subscribeDisplayMode,
    readInstallSurface,
    serverInstallSurface,
  );

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (surface === "standalone") return null;

  if (prompt) {
    return (
      <button
        type="button"
        onClick={() => void prompt.prompt()}
        className="border-border/60 bg-card mt-6 flex w-full items-center gap-3 rounded-2xl border p-4 text-left"
      >
        <Download className="text-primary h-5 w-5 shrink-0" />
        <span>
          <span className="block text-sm font-medium">Add to your home screen</span>
          <span className="text-muted-foreground block text-xs">
            Opens full screen and works without signal.
          </span>
        </span>
      </button>
    );
  }

  if (surface !== "ios") return null;

  return (
    <p className="border-border/60 text-muted-foreground mt-6 flex items-start gap-3 rounded-2xl border border-dashed p-4 text-xs">
      <Share className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        To keep this on your home screen, tap <strong>Share</strong> then{" "}
        <strong>Add to Home Screen</strong>. It then opens full screen and works
        without signal.
      </span>
    </p>
  );
}

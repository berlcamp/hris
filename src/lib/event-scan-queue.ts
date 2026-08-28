import type { EventRecord, EventScanRosterEntry, ScannableEvent } from "@/lib/types";

/**
 * The scanner's on-device store: the event's roster (so a scan resolves to a
 * name with no signal) and the queue of scans not yet accepted by the server.
 *
 * The queue is keyed to the EVENT, never to the session. A Supabase access
 * token dies after an hour offline and `src/proxy.ts` will bounce the officer to
 * /login the moment the phone reconnects — if the queue lived in the session it
 * would take a morning of attendance with it. It survives logout, expiry, tab
 * close and app restart, and flushes after the officer signs back in.
 *
 * Only THIS event's roster is cached. A phone carrying every token in the LGU
 * would be a forgery kit; a sixty-person seminar caches sixty entries.
 */

const DB_NAME = "hris-event-scans";
// v2 added STORE_EVENTS, the list the home screen renders when there is no
// signal. Bumping the version is what runs onupgradeneeded on a device that
// already has a v1 database and a morning of queued scans in it — the guards
// below leave those three stores untouched.
const DB_VERSION = 2;
const STORE_META = "event_meta";
const STORE_ROSTER = "event_roster";
const STORE_QUEUE = "scan_queue";
const STORE_EVENTS = "events_index";

export interface QueuedScan {
  client_scan_id: string;
  event_id: string;
  token: string;
  /** Device clock at the moment of the scan. The server buckets it in Manila time. */
  scanned_at: string;
  /** Snapshot of the name shown to the officer, for the on-device history list. */
  full_name: string | null;
}

export interface CachedEvent {
  event_id: string;
  event: EventRecord;
  cached_at: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "event_id" });
      }
      if (!db.objectStoreNames.contains(STORE_ROSTER)) {
        const store = db.createObjectStore(STORE_ROSTER, { keyPath: "key" });
        store.createIndex("by_event", "event_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, { keyPath: "client_scan_id" });
        store.createIndex("by_event", "event_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        db.createObjectStore(STORE_EVENTS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        let result: T;
        Promise.resolve(body(tx)).then(
          (value) => {
            result = value;
          },
          reject,
        );
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * The open-events list as the home screen last saw it, plus when that was.
 *
 * Counts go stale the moment the connection drops — they are a snapshot of the
 * server, not of this device's queue — so the home screen renders `cached_at`
 * next to them rather than passing an hours-old number off as live.
 */
export interface CachedEventIndex {
  events: ScannableEvent[];
  cached_at: string | null;
}

/**
 * Replaces the cached open-events list.
 *
 * A full replace, not a merge: an event that has since been closed must
 * DISAPPEAR from the home screen, and a merge would leave it there forever,
 * offering a card that scans into an event whose report is already filed.
 */
export async function cacheScannableEvents(events: ScannableEvent[]): Promise<void> {
  const cached_at = new Date().toISOString();
  await run([STORE_EVENTS], "readwrite", async (tx) => {
    const store = tx.objectStore(STORE_EVENTS);
    const keep = new Set(events.map((e) => e.id));
    for (const key of await wrap(store.getAllKeys())) {
      if (!keep.has(String(key))) store.delete(key);
    }
    for (const event of events) store.put({ ...event, cached_at });
  });
}

export async function getCachedScannableEvents(): Promise<CachedEventIndex> {
  const rows = await run([STORE_EVENTS], "readonly", async (tx) =>
    wrap(tx.objectStore(STORE_EVENTS).getAll()),
  );
  const typed = rows as (ScannableEvent & { cached_at: string })[];
  return {
    events: typed.map(({ cached_at: _cached_at, ...event }) => event),
    cached_at: typed[0]?.cached_at ?? null,
  };
}

/**
 * How many scans are still waiting to reach the server, per event.
 *
 * The home screen shows this on each card so an officer who closed the app at a
 * dead venue can see, before tapping anything, that yesterday's door is still
 * sitting unsent on the phone.
 */
export async function getQueueCountsByEvent(): Promise<Map<string, number>> {
  const rows = (await run([STORE_QUEUE], "readonly", async (tx) =>
    wrap(tx.objectStore(STORE_QUEUE).getAll()),
  )) as QueuedScan[];
  const counts = new Map<string, number>();
  for (const scan of rows) {
    counts.set(scan.event_id, (counts.get(scan.event_id) ?? 0) + 1);
  }
  return counts;
}

/** Replaces the cached roster for an event with a freshly downloaded one. */
export async function cacheEventPayload(
  event: EventRecord,
  roster: EventScanRosterEntry[],
): Promise<void> {
  await run([STORE_META, STORE_ROSTER], "readwrite", async (tx) => {
    tx.objectStore(STORE_META).put({
      event_id: event.id,
      event,
      cached_at: new Date().toISOString(),
    } satisfies CachedEvent);

    const rosterStore = tx.objectStore(STORE_ROSTER);
    const index = rosterStore.index("by_event");
    const stale = await wrap(index.getAllKeys(IDBKeyRange.only(event.id)));
    for (const key of stale) rosterStore.delete(key);

    for (const entry of roster) {
      // A person with no live credential yet has no token, so there is nothing
      // to match a scan against — they are reachable only by manual entry.
      if (!entry.token) continue;
      rosterStore.put({
        key: `${event.id}:${entry.token}`,
        event_id: event.id,
        ...entry,
      });
    }
  });
}

export async function getCachedEvent(eventId: string): Promise<CachedEvent | null> {
  return run([STORE_META], "readonly", async (tx) =>
    (await wrap(tx.objectStore(STORE_META).get(eventId))) ?? null,
  );
}

export async function getCachedRoster(
  eventId: string,
): Promise<(EventScanRosterEntry & { key: string; event_id: string })[]> {
  return run([STORE_ROSTER], "readonly", async (tx) =>
    wrap(tx.objectStore(STORE_ROSTER).index("by_event").getAll(IDBKeyRange.only(eventId))),
  );
}

/** Resolves a scanned token to a roster entry without touching the network. */
export async function lookupToken(
  eventId: string,
  token: string,
): Promise<EventScanRosterEntry | null> {
  return run([STORE_ROSTER], "readonly", async (tx) =>
    (await wrap(tx.objectStore(STORE_ROSTER).get(`${eventId}:${token}`))) ?? null,
  );
}

/** The schema cap on client_scan_id (see eventScanSchema). */
const MAX_SCAN_ID = 64;

/**
 * A fresh idempotency key for one scan.
 *
 * A UUID rather than something descriptive: the id only has to be STABLE — it
 * is minted once, stored in the queue, and resent verbatim on every retry — and
 * it has to fit in 64 characters. An earlier version composed it from the event
 * id, the token and the timestamp, which came to 83 characters and made every
 * single sync fail validation.
 */
export function newScanId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Rewrites queued scans whose id predates the length fix.
 *
 * Those scans are real attendance the officer recorded at a door; they would
 * otherwise sit on the device failing validation forever. Rekeying is safe:
 * the id exists only to make a retry idempotent, and a scan that never reached
 * the server has nothing to be idempotent against yet. The per-day unique index
 * still catches a genuine double-record.
 */
export async function repairQueueIds(eventId: string): Promise<number> {
  const queued = await getQueue(eventId);
  const oversized = queued.filter((s) => s.client_scan_id.length > MAX_SCAN_ID);
  if (oversized.length === 0) return 0;

  await run([STORE_QUEUE], "readwrite", (tx) => {
    const store = tx.objectStore(STORE_QUEUE);
    for (const scan of oversized) {
      store.delete(scan.client_scan_id);
      store.put({ ...scan, client_scan_id: newScanId() });
    }
  });
  return oversized.length;
}

export async function enqueueScan(scan: QueuedScan): Promise<void> {
  await run([STORE_QUEUE], "readwrite", (tx) => {
    tx.objectStore(STORE_QUEUE).put(scan);
  });
}

export async function getQueue(eventId: string): Promise<QueuedScan[]> {
  return run([STORE_QUEUE], "readonly", async (tx) =>
    wrap(tx.objectStore(STORE_QUEUE).index("by_event").getAll(IDBKeyRange.only(eventId))),
  );
}

/**
 * Drops scans the server has accounted for.
 *
 * A duplicate counts as accounted for: the record already exists, so replaying
 * it forever would keep the queue from ever draining.
 */
export async function dequeueScans(clientScanIds: string[]): Promise<void> {
  if (clientScanIds.length === 0) return;
  await run([STORE_QUEUE], "readwrite", (tx) => {
    const store = tx.objectStore(STORE_QUEUE);
    for (const id of clientScanIds) store.delete(id);
  });
}

/** Whether this browser can run the offline store at all. */
export function offlineStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

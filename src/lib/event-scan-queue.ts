import type { EventRecord, EventScanRosterEntry } from "@/lib/types";

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
const DB_VERSION = 1;
const STORE_META = "event_meta";
const STORE_ROSTER = "event_roster";
const STORE_QUEUE = "scan_queue";

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

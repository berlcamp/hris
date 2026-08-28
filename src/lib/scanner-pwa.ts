"use client";

/**
 * Service-worker plumbing for the Attendance Checker app.
 *
 * Kept out of the components so the two screens that need it (/scan and
 * /scan/[id]) cannot drift into registering two different workers, at two
 * different scopes, against two different cache names.
 */

/**
 * Must match CACHE in public/scan-sw.js.
 *
 * The home screen writes into this cache directly (see warmScanRoutes) rather
 * than messaging the worker: `caches` is a window API too, and a one-way
 * postMessage gives no way to know the warm-up finished before the officer
 * walks out of signal.
 */
export const SCANNER_CACHE = "hris-scanner-v2";

const WORKER_URL = "/scan-sw.js";

/**
 * The scope is the string prefix "/scan" — NOT "/scan/".
 *
 * Service-worker scope is a plain URL-prefix match, not a path-segment one, so
 * "/scan/" would leave the home screen itself uncontrolled and it alone would
 * fail to open offline. There is no other route in this application that starts
 * with those five characters, so the loose prefix costs nothing.
 */
const WORKER_SCOPE = "/scan";

/** The worker this replaced. Registered at /events/ — see the note in register(). */
const RETIRED_WORKER = "events-scan-sw.js";

export function scannerWorkerSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Registers the scanner's worker and retires its predecessor.
 *
 * The old worker was registered at scope /events/ back when the scanner lived
 * at /events/:id/scan. A registration outlives the routes it was made for, so a
 * phone that worked a door last month still carries it; it would sit there
 * serving a cached copy of a page that now only redirects. getRegistrations()
 * returns every registration for the origin regardless of scope, which is why
 * this can clean it up from a page the old worker never controlled.
 *
 * Failure is not fatal and is deliberately swallowed: with no worker the app
 * simply cannot be reopened without signal. Scanning, queueing and syncing all
 * still work for as long as the tab stays open.
 */
export async function registerScannerWorker(): Promise<void> {
  if (!scannerWorkerSupported()) return;

  try {
    const existing = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      existing
        .filter((r) => r.active?.scriptURL.endsWith(RETIRED_WORKER))
        .map((r) => r.unregister()),
    );
  } catch {
    // An origin that refuses to enumerate registrations still allows the
    // register() below, which is the part that matters.
  }

  try {
    await navigator.serviceWorker.register(WORKER_URL, { scope: WORKER_SCOPE });
  } catch {
    // See above.
  }
}

/**
 * Pre-caches the scanner page of every open event.
 *
 * Without this, opening an event for the first time at a venue with no signal
 * fails: the worker's cache is keyed by URL and /scan/<id> is a URL it has
 * never seen. The officer's own phone is the only place this can be fixed, and
 * the moment they have signal — the home screen — is the only time it can be.
 *
 * Resolves even when some or all of the warm-ups fail; a missing page degrades
 * to "this one event needs signal to open", not to a broken app.
 */
export async function warmScanRoutes(eventIds: string[]): Promise<void> {
  if (typeof caches === "undefined" || eventIds.length === 0) return;
  try {
    const cache = await caches.open(SCANNER_CACHE);
    await Promise.allSettled(
      eventIds.map(async (id) => {
        // Same-origin, so the session cookie rides along and the response is
        // the real page rather than a redirect to /login.
        const response = await fetch(`/scan/${id}`, { credentials: "same-origin" });
        if (response.ok) await cache.put(`/scan/${id}`, response.clone());
      }),
    );
  } catch {
    // Storage pressure or a private-mode browser with no Cache API.
  }
}

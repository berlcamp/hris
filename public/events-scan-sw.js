/*
 * Service worker for the event scanner — and ONLY the event scanner.
 *
 * ── Why this file is so restrictive ──────────────────────────────────────
 * Every other page in this application is authenticated and server-rendered:
 * the HTML contains the signed-in user's name, their department's employees,
 * payroll figures. A service worker that cached those responses would serve one
 * user's HR data to the next person who signed in on the same device. So this
 * worker refuses to touch anything except two kinds of request:
 *
 *   1. Navigations to /events/<id>/scan — the scanner page, which is a
 *      DATA-FREE client shell by design (see (scanner)/layout.tsx). Everything
 *      it displays comes from IndexedDB, not from the cached HTML.
 *   2. /_next/static/* — content-hashed, immutable build assets with no user
 *      data in them. The scanner cannot boot offline without its own JS.
 *
 * Anything else falls through untouched: no respondWith, no caching, normal
 * network behaviour. Do NOT widen this. If the scanner ever needs another
 * resource offline, add it to the allowlist explicitly rather than relaxing the
 * checks.
 *
 * The registration scope is /events/ (see event-scanner-client.tsx). Scope only
 * decides which PAGES this worker controls; a controlled page's subresource
 * requests reach this fetch handler regardless of their path, which is why the
 * /_next/static rule works from here.
 */

const CACHE = "hris-event-scanner-v1";

// /events/<something>/scan, with or without a trailing slash or query string.
const SCAN_PATH = /^\/events\/[^/]+\/scan\/?$/;

self.addEventListener("install", (event) => {
  // Take over as soon as the officer opens the scanner; waiting for every other
  // /events tab to close would leave them without an offline shell at the door.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("hris-event-scanner-") && n !== CACHE)
             .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Network first, falling back to cache — so a reload at the venue still boots. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

/** Cache first — build assets are content-hashed, so a hit is always correct. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Never interfere with writes. Queued scans are submitted through a server
  // action POST; replaying one from a cache would double-record attendance.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && SCAN_PATH.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else: untouched.
});

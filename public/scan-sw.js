/*
 * Service worker for the Attendance Checker app — and ONLY for it.
 *
 * ── Why this file is so restrictive ──────────────────────────────────────
 * Every other page in this application is authenticated and server-rendered:
 * the HTML contains the signed-in user's name, their department's employees,
 * payroll figures. A service worker that cached those responses would serve one
 * user's HR data to the next person who signed in on the same device. So this
 * worker refuses to touch anything except two kinds of request:
 *
 *   1. Navigations to /scan and /scan/<id> — the checker's two screens, which
 *      are DATA-FREE client shells by design (see (scanner)/layout.tsx).
 *      Everything they display comes from IndexedDB, not from the cached HTML.
 *   2. /_next/static/* — content-hashed, immutable build assets with no user
 *      data in them. The app cannot boot offline without its own JS.
 *
 * Anything else falls through untouched: no respondWith, no caching, normal
 * network behaviour. Do NOT widen this. If the app ever needs another resource
 * offline, add it to the allowlist explicitly rather than relaxing the checks.
 *
 * The registration scope is the prefix "/scan" (see src/lib/scanner-pwa.ts).
 * Scope only decides which PAGES this worker controls; a controlled page's
 * subresource requests reach this fetch handler regardless of their path, which
 * is why the /_next/static rule works from here.
 *
 * This replaced events-scan-sw.js, which was scoped to /events/ when the
 * scanner lived at /events/:id/scan. scanner-pwa.ts unregisters that one.
 */

// Must match SCANNER_CACHE in src/lib/scanner-pwa.ts, which writes into this
// same cache to pre-warm each event's scanner page while there is still signal.
const CACHE = "hris-scanner-v2";

// The home screen: /scan, with or without a trailing slash or query string.
const HOME_PATH = /^\/scan\/?$/;
// One event's scanner: /scan/<id>.
const SCAN_PATH = /^\/scan\/[^/]+\/?$/;

self.addEventListener("install", (event) => {
  // Take over as soon as the officer opens the app; waiting for every other tab
  // to close would leave them without an offline shell at the door.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (n) =>
              (n.startsWith("hris-scanner-") ||
                // The name the retired /events/ worker used.
                n.startsWith("hris-event-scanner-")) &&
              n !== CACHE,
          )
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Network first, falling back to cache — so a reload at the venue still boots.
 *
 * A REDIRECTED response is never cached. Offline, Supabase cannot refresh an
 * expired session, so src/proxy.ts answers with a redirect to /login; caching
 * that would replace the officer's working offline shell with a sign-in page
 * they have no connection to complete.
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok && !response.redirected) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // ignoreVary: Next varies its responses on RSC routing headers, which a
    // navigation and the home screen's pre-warm fetch do not send alike. Left
    // on, the cache holds the page and still reports a miss.
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    // An event whose page was never opened and never warmed. The home screen is
    // cached far more reliably, and it can at least say what went wrong.
    if (SCAN_PATH.test(new URL(request.url).pathname)) {
      const home = await cache.match("/scan", { ignoreVary: true });
      if (home) return home;
    }
    throw err;
  }
}

/** Cache first — build assets are content-hashed, so a hit is always correct. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
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

  if (
    request.mode === "navigate" &&
    (HOME_PATH.test(url.pathname) || SCAN_PATH.test(url.pathname))
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else: untouched.
});

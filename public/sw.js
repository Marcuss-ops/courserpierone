// Cache name bumped from "courssy-v2" → "courssy-v3" as part of the
// Courssy brand canonical migration (ADR-0015 §Migration plan commit 4).
// The version digit bump (v2 → v3) ensures the activate handler below
// `caches.keys().then(keys => keys.filter(k => k !== CACHE_NAME).map(caches.delete))`
// invalidates the pre-rename cache automatically on the next SW lifecycle.
const CACHE_NAME = "courssy-v3";
const OFFLINE_PAGE = "/offline.html";

// ─── Risorse da pre-cachare all'install ──────────────────
const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  OFFLINE_PAGE,
];

// ─── Strategie di cache per tipo di risorsa ──────────────
const CACHE_FIRST_PATTERNS = [
  /\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)$/,  // immagini e font
  /\/_next\/static\//,                                       // chunk JS/CSS di Next
];

const STALE_WHILE_REVALIDATE_PATTERNS = [
  // Landing page pattern: /locale/slug (con o senza trailing slash)
  /^\/(?:[a-z]{2}(?:-[a-z]{2})?)\/[^/]+\/?$/,
  // Corso lezioni
  /\/curso\//,
  // Ebook reader
  /\/ebook\//,
  // Dashboard e portal
  /\/dashboard/,
  /\/portal/,
];

// ─── Install ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          fetch(url, { cache: "no-cache" })
            .then((res) => (res.ok ? cache.put(url, res) : Promise.resolve()))
            .catch(() => {})
        )
      );
    })()
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Helper: match pattern ───────────────────────────────
// NB: must be plain JavaScript — service workers run in a separate
// scope and are parsed as JS, not TS. Adding type annotations here
// breaks registration with "ServiceWorker script evaluation failed".
function matchesPatterns(url, patterns) {
  return patterns.some((p) => p.test(url));
}

// ─── Fetch ────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo GET
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Solo http/https
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Skip API e analytics
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  // Stale-while-revalidate su pathname (senza query params)
  const urlPath = url.pathname;

  // ── Strategia 1: Cache First (immagini, font, static Next.js) ──
  if (matchesPatterns(urlPath, CACHE_FIRST_PATTERNS)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── Strategia 2: Stale-While-Revalidate (landing pages, lezioni) ──
  if (matchesPatterns(urlPath, STALE_WHILE_REVALIDATE_PATTERNS)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetched = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached || caches.match(OFFLINE_PAGE));
        return cached || fetched;
      })
    );
    return;
  }

  // ── Strategia 3: Network First con fallback offline ──────
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          // Per richieste di navigazione (pagine HTML), mostra pagina offline
          if (request.mode === "navigate") return caches.match(OFFLINE_PAGE);
          return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
        })
      )
  );
});

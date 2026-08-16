// NEXUS PWA service worker — cache-first for app shell, network-first for API
// Phase 10: offline mission cache for recent missions
const CACHE_NAME = "nexus-app-v1";
const MISSIONS_CACHE = "nexus-missions-v1";
const MISSIONS_CACHE_KEYS = ["mission-list-recent", "mission-list-my", "mission-list-projects"];
const MAX_MISSION_CACHE_AGE_MS = 5 * 60 * 1000; // 5 minutes
// Fase 19 — offline real: Super Memória (notas + busca) e feed cognitivo ficam
// disponíveis sem conexão, cada rota com sua janela de frescor.
const NOTES_CACHE = "nexus-notes-v1";
const NOTES_CACHE_KEY = "super-notes-list";
const MAX_NOTES_CACHE_AGE_MS = 30 * 60 * 1000; // 30 minutos (notas mudam pouco)
const FEED_CACHE = "nexus-feed-v1";
const FEED_CACHE_KEY = "feed-list-recent";
const MAX_FEED_CACHE_AGE_MS = 10 * 60 * 1000; // 10 minutos
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls: network first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    // Phase 10: recent missions are cached for offline reading (cached response body, not wrapped)
    // Fase 19 — rotas cacheáveis para leitura offline (GET, tRPC queries)
    const isMissionList =
      url.pathname.startsWith("/api/trpc/") &&
      url.search.includes("missions.list") &&
      event.request.method === "GET";
    const isSuperNotesList =
      url.pathname.startsWith("/api/trpc/") &&
      url.search.includes("superNotes.list") &&
      event.request.method === "GET";
    const isFeedList =
      url.pathname.startsWith("/api/trpc/") &&
      url.search.includes("feed.list") &&
      event.request.method === "GET";
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            copy.arrayBuffer().then((buffer) => {
              if (isMissionList) {
                const entry = new Response(buffer, { headers: { "content-type": response.headers.get("content-type") || "application/json", "x-nexus-cached-at": String(Date.now()) } });
                caches.open(MISSIONS_CACHE).then((cache) => cache.put(MISSIONS_CACHE_KEYS[0], entry));
              } else if (isSuperNotesList) {
                const entry = new Response(buffer, { headers: { "content-type": response.headers.get("content-type") || "application/json", "x-nexus-cached-at": String(Date.now()) } });
                caches.open(NOTES_CACHE).then((cache) => cache.put(NOTES_CACHE_KEY, entry));
              } else if (isFeedList) {
                const entry = new Response(buffer, { headers: { "content-type": response.headers.get("content-type") || "application/json", "x-nexus-cached-at": String(Date.now()) } });
                caches.open(FEED_CACHE).then((cache) => cache.put(FEED_CACHE_KEY, entry));
              } else {
                caches.open(CACHE_NAME + "-api").then((cache) =>
                  cache.put(event.request, new Response(buffer, { headers: { "content-type": response.headers.get("content-type") || "application/json" } }))
                );
              }
            });
          }
          return response;
        })
        .catch(async () => {
          // Fase 19 — serve cada rota cacheada offline dentro da sua janela
          function offlineGeneric() {
            const body = JSON.stringify({ json: null, error: { json: { message: "offline" } } });
            return new Response(body, { status: 503, headers: { "content-type": "application/json" } });
          }
          async function serveOffline(cacheName, key, maxAge) {
            const offline = await caches.open(cacheName);
            const entry = await offline.match(key);
            if (!entry) return null;
            const cachedAt = Number(entry.headers.get("x-nexus-cached-at") || 0);
            if (Date.now() - cachedAt > maxAge) return null;
            const clone = await entry.clone();
            const buffer = await clone.arrayBuffer();
            return new Response(buffer, { headers: { "content-type": entry.headers.get("content-type") || "application/json", "x-nexus-offline": "true" } });
          }
          if (isMissionList) return (await serveOffline(MISSIONS_CACHE, MISSIONS_CACHE_KEYS[0], MAX_MISSION_CACHE_AGE_MS)) || offlineGeneric();
          if (isSuperNotesList) return (await serveOffline(NOTES_CACHE, NOTES_CACHE_KEY, MAX_NOTES_CACHE_AGE_MS)) || offlineGeneric();
          if (isFeedList) return (await serveOffline(FEED_CACHE, FEED_CACHE_KEY, MAX_FEED_CACHE_AGE_MS)) || offlineGeneric();
          return offlineGeneric();
        })
    );
    return;
  }

  // App shell and static assets: cache first
  if (event.request.mode === "navigate" || url.pathname.startsWith("/assets/") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".ico") || url.pathname.endsWith(".webmanifest")) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok && (event.request.method === "GET")) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
      )
    );
  }
});

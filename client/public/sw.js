// NEXUS PWA service worker — cache-first for app shell, network-first for API
// Phase 10: offline mission cache for recent missions
const CACHE_NAME = "nexus-app-v1";
const MISSIONS_CACHE = "nexus-missions-v1";
const MISSIONS_CACHE_KEYS = ["mission-list-recent", "mission-list-my", "mission-list-projects"];
const MAX_MISSION_CACHE_AGE_MS = 5 * 60 * 1000; // 5 minutes
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
    const isMissionList =
      url.pathname.startsWith("/api/trpc/") &&
      url.search.includes("missions.list") &&
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
          if (isMissionList) {
            // Serve cached recent missions offline (within freshness window)
            const offline = await caches.open(MISSIONS_CACHE);
            const entry = await offline.match(MISSIONS_CACHE_KEYS[0]);
            if (entry) {
              const cachedAt = Number(entry.headers.get("x-nexus-cached-at") || 0);
              if (Date.now() - cachedAt < MAX_MISSION_CACHE_AGE_MS) {
                const clone = await entry.clone();
                const buffer = await clone.arrayBuffer();
                return new Response(buffer, { headers: { "content-type": entry.headers.get("content-type") || "application/json", "x-nexus-offline": "true" } });
              }
            }
          }
          const generic = await caches.match(event.request);
          return generic || new Response("{\"json\":null,\"error\":{\"json\":{\"message\":\"offline\"}}}", {
            status: 503,
            headers: { "content-type": "application/json" },
          });
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

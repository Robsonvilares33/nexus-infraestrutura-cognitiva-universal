import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";

const queryClient = new QueryClient();

// Phase 17 fix: the dev server runs Vite + Express in the same process, so every
// tsx-watch backend restart re-instantiates Vite and may regenerate the
// prebundle content hash for react/* deps. A browser tab that still holds the
// old module graph mixes the stale react identity with the new one → "Invalid
// hook call". The Vite HMR client emits a `full-reload` message on reconnect
// after a server restart; honoring it forces a fresh module graph.
if (import.meta.hot) {
  import.meta.hot.on("vite:beforeFullReload", () => {
    window.location.reload();
  });
}

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// Register service worker for PWA support (app installable on mobile/desktop)
// PWA service worker: register only in production builds. In dev mode the SW
// can cache a stale Vite module graph (old prebundle hashes), which mixes two
// React identities in the same page and triggers "Invalid hook call".
if ("serviceWorker" in navigator && window.isSecureContext === true && !import.meta.env.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal: app works fine without SW
    });
  });
}

// Fase 19 (reforço da Fase 17): em desenvolvimento, remover qualquer service
// worker residual e limpar os caches antigos do PWA — um SW do build anterior
// (com hashes de prebundle antigos) mistura duas identidades do React na
// mesma página e causa "Invalid hook call".
if ("serviceWorker" in navigator && window.isSecureContext === true && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations?.().then(registrations => {
    registrations.forEach(r => r.unregister());
  }).catch(() => {});
  try {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
  } catch { /* ignorar */ }
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

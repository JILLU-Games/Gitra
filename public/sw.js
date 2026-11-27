const CACHE_NAME = "gitra-shell-v1";
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

const BYPASS_EXACT_PATHS = new Set(["/auth", "/admin", "/sw.js"]);
const BYPASS_PREFIXES = [
  "/auth/",
  "/admin/",
  "/user/",
  "/api/",
  "/@vite/",
  "/@react-refresh",
  "/__vite_ping",
  "/src/",
  "/node_modules/",
];
const BYPASS_GIT_SUFFIXES = [
  "/info/refs",
  "/git-upload-pack",
  "/git-receive-pack",
  "/raw",
  "/rawpath",
];

function shouldBypassRequest(url, method) {
  if (url.origin !== self.location.origin) return true;
  if (String(method || "GET").toUpperCase() !== "GET") return true;
  const pathname = url.pathname;
  if (BYPASS_EXACT_PATHS.has(pathname)) return true;
  for (let i = 0; i < BYPASS_PREFIXES.length; i += 1) {
    if (pathname.startsWith(BYPASS_PREFIXES[i])) return true;
  }
  for (let i = 0; i < BYPASS_GIT_SUFFIXES.length; i += 1) {
    if (pathname.endsWith(BYPASS_GIT_SUFFIXES[i])) return true;
  }
  return false;
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/favicon.ico"
  );
}

function offlineFallbackResponse() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#09090b" />
  <title>Offline · gitra</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #09090b;
      color: #f4f4f5;
      font-family: "Segoe UI", "Segoe UI Web", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
      padding: 1.25rem;
    }
    .panel {
      width: 100%;
      max-width: 26rem;
      border: 1px solid #242429;
      background: #111114;
      padding: 1.5rem;
    }
    h1 { margin: 0 0 0.5rem; font-size: 1rem; font-weight: 600; }
    p { margin: 0 0 1.25rem; font-size: 0.8125rem; line-height: 1.5; color: #a1a1aa; }
    button {
      height: 2rem;
      padding: 0 0.875rem;
      border: 1px solid #242429;
      background: #f4f4f5;
      color: #09090b;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main class="panel">
    <h1>You are offline</h1>
    <p>Network connectivity is unavailable. Reconnect to load live repositories, commits, and settings.</p>
    <button type="button" onclick="window.location.reload()">Retry</button>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .finally(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (shouldBypassRequest(url, req.method)) {
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const networkPromise = fetch(req)
          .then((response) => {
            if (response && response.ok && response.type === "basic") {
              void cache.put(req, response.clone());
            }
            return response;
          })
          .catch(() => null);
        return cached || (await networkPromise) || new Response("", { status: 504 });
      })
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (
            response &&
            response.ok &&
            (url.pathname === "/" || url.pathname === "/explore" || url.pathname === "/namespaces")
          ) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cached = (await cache.match(req)) || (await cache.match("/"));
          return cached || offlineFallbackResponse();
        })
    );
  }
});

const CACHE_PREFIX = "rdv-";
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-v2`;
const MENU_CACHE = `${CACHE_PREFIX}menu-v2`;
const STATIC_CACHE = `${CACHE_PREFIX}static-v2`;
const APP_SHELL_URLS = ["/", "/tables", "/order"];
const MAX_MENU_ENTRIES = 18;
// Local development assets keep the same URL across edits; always use the current server response.
const LOCAL_PREVIEW = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(self.location.hostname) ||
  new URL(self.location.href).searchParams.get("preview") === "1";

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((request) => cache.delete(request)));
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/menus/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("install", (event) => {
  if (LOCAL_PREVIEW) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  if (LOCAL_PREVIEW) {
    // Only obsolete preview assets/pages: never touch login, drafts, or menu data.
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("rdv-static-") || key.startsWith("rdv-runtime-"))
        .map((key) => caches.delete(key)));
      await self.clients.claim();
    })());
    return;
  }
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX))
        .filter((key) => ![RUNTIME_CACHE, MENU_CACHE, STATIC_CACHE].includes(key))
        .map((key) => caches.delete(key))
    ))
  );
});

self.addEventListener("fetch", (event) => {
  if (LOCAL_PREVIEW) return;
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/menu") {
    event.respondWith((async () => {
      const cache = await caches.open(MENU_CACHE);
      const cached = await cache.match(request);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          await trimCache(MENU_CACHE, MAX_MENU_ENTRIES);
        }
        return response;
      } catch {
        if (cached) return cached;
        throw new Error("menu unavailable");
      }
    })());
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (
          await cache.match(request) ||
          (url.pathname === "/order" ? await caches.match("/order") : undefined) ||
          (url.pathname !== "/order" ? await cache.match(url.pathname, { ignoreSearch: true }) : undefined) ||
          (url.pathname !== "/order" ? await caches.match(url.pathname, { ignoreSearch: true }) : undefined) ||
          await caches.match("/tables") ||
          await caches.match("/") ||
          new Response("RDV Ordering is offline. Reconnect and try again.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          })
        );
      }
    })());
  }
});

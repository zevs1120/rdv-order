const STATIC_CACHE = "rdv-static-v2";
const STATIC_PATH_PREFIXES = ["/_next/static/", "/icons/"];
const STATIC_EXTENSIONS = [".css", ".js", ".mjs", ".woff2", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"];

function isStaticAsset(url) {
  if (STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return true;
  return STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== STATIC_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req));
    return;
  }

  if (!isStaticAsset(url)) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            cache.put(req, res.clone()).catch(() => undefined);
          }
          return res;
        })
        .catch(() => undefined);

      if (cached) {
        network.catch(() => undefined);
        return cached;
      }

      const fresh = await network;
      if (fresh) return fresh;
      return Response.error();
    })
  );
});

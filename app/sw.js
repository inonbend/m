/* Form Coach service worker: app shell precache + offline pose model */
const VERSION = "form-coach-v1.0.0";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const MODEL = "form-coach-model"; // kept across app updates: the model rarely changes and is large

const PRECACHE = [
  "./", "./index.html", "./manifest.webmanifest",
  "./vendor/jszip.min.js",
  "./vendor/tasks-vision/vision_bundle.mjs",
  "./vendor/tasks-vision/wasm/vision_wasm_internal.js",
  "./vendor/tasks-vision/wasm/vision_wasm_internal.wasm",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];
const isModel = url => url.pathname.endsWith(".task");

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== RUNTIME && k !== MODEL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Page navigations: network first so updates arrive, cached app when offline.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(SHELL).then(s => s.put("./index.html", c)); return r; })
      .catch(() => caches.match("./index.html")));
    return;
  }

  // Pose model (self-hosted or Google's): cache first, forever.
  if (isModel(url)) {
    e.respondWith(caches.open(MODEL).then(async c => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      const r = await fetch(req.url, { mode: url.origin === location.origin ? "same-origin" : "cors" });
      if (r.ok && !(r.headers.get("content-type") || "").includes("text/html")) c.put(req.url, r.clone());
      return r;
    }));
    return;
  }

  // Same-origin files (app code, WASM, icons): cache first, fill in on first use.
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(RUNTIME).then(s => s.put(req, c)); }
      return r;
    })));
  }
});

const CACHE_NAME = "book-tweet-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./config.js",
  "./manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // 不缓存 API 请求
  if (url.hostname.includes("deepseek.com")) return;
  if (url.hostname.includes("cdnjs.cloudflare.com")) {
    // CDN 资源缓存优先
    e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});

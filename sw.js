/* Service worker: menyimpan file aplikasi agar tetap bisa dibuka tanpa internet.
   Strategi "internet dulu": saat online selalu mengambil versi terbaru dari Netlify,
   saat offline memakai salinan tersimpan. Permintaan ke situs lain (mis. Supabase) tidak disentuh.
   Ubah VERSION setiap merilis versi baru: HP akan menampilkan "Versi baru tersedia". */
const VERSION = "2.0.0";
const CACHE = "kka-app-" + VERSION;
const FILES = ["./", "index.html", "style.css", "app.js", "check.js", "geo.js", "camera.js", "video.js", "zip.js", "config.js", "supabase.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(FILES.map(f => c.add(new Request(f, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

// Hapus cache versi lama (termasuk "kka-v1" dari versi pertama)
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== "kka-tiles").map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});

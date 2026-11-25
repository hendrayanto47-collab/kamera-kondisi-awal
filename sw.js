/* Service worker: menyimpan file aplikasi agar tetap bisa dibuka tanpa internet.
   Strategi "simpanan dulu": aplikasi selalu dibuka dari salinan di HP (cepat & jalan tanpa sinyal);
   versi baru diunduh lengkap di latar saat ada sinyal. Permintaan ke situs lain (mis. Supabase) tidak disentuh.
   Ubah VERSION setiap merilis versi baru: HP akan menampilkan "Versi baru tersedia". */
const VERSION = "2.18.0";
const CACHE = "kka-app-" + VERSION;
const FILES = ["./", "index.html", "style.css", "app.js", "check.js", "geo.js", "camera.js", "video.js", "mp4fix.js", "zip.js", "config.js", "supabase.js", "gdrive.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      // semua file harus terunduh lengkap; bila sinyal putus di tengah, versi lama tetap dipakai dan dicoba lagi nanti
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
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

/* File aplikasi: SALINAN TERSIMPAN DULU (langsung terbuka walau tanpa sinyal / sinyal lemah).
   Versi baru tetap datang: setiap rilis mengganti sw.js (VERSION), HP mengunduh semua file baru di latar,
   lalu aplikasi menampilkan "Versi baru tersedia". File yang belum tersimpan diambil dari internet (maks. 8 detik). */
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request, { ignoreSearch: true })
      || (e.request.mode === "navigate" ? await caches.match("index.html") : null);
    if (cached) return cached;
    try {
      const res = await withTimeout(fetch(e.request, { cache: "no-cache" }), 8000);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    } catch (err) {
      return (await caches.match("index.html")) || new Response("Offline", { status: 503 });
    }
  })());
});

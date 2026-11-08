/* Lokasi untuk cap foto: Plus Code, alamat (OpenStreetMap/Nominatim), dan peta mini (ubin OpenStreetMap).
   - Plus Code dihitung di HP (tanpa internet).
   - Alamat & ubin peta diambil saat online lalu disimpan, sehingga di lokasi tanpa sinyal tetap tampil.
   Menyediakan window.KKAGeo. */
(function () {
  // ---------- Plus Code (Open Location Code) ----------
  const ALPH = "23456789CFGHJMPQRVWX";
  function plusCode(lat, lng) {
    lat = Math.min(89.9999999, Math.max(-90, lat)) + 90;
    lng = ((lng + 180) % 360 + 360) % 360;
    let code = "", res = 20;
    for (let i = 0; i < 5; i++) {
      const dl = Math.floor(lat / res), dg = Math.floor(lng / res);
      code += ALPH[dl] + ALPH[dg];
      lat -= dl * res; lng -= dg * res; res /= 20;
      if (code.length === 8) code += "+";
    }
    return code; // contoh: 6QXCG4GM+5V
  }
  const shortCode = c => c.slice(4); // G4GM+5V (berlaku di sekitar lokasi)

  // ---------- Alamat (reverse geocoding OpenStreetMap) ----------
  const ADDR_KEY = "kka-addr-cache";
  let addrCache = {};
  try { addrCache = JSON.parse(localStorage.getItem(ADDR_KEY) || "{}"); } catch (e) {}
  const cellOf = (lat, lng) => `${lat.toFixed(3)},${lng.toFixed(3)}`; // ±100 m
  /* Susun alamat dari tingkat terkecil ke terbesar, tanpa menebak awalan (Kec./Kab.) agar tidak salah tempat.
     Operator tetap bisa mengoreksi di kolom "Alamat lokasi". */
  function formatAddr(j) {
    const a = j.address || {};
    const order = ["hamlet", "village", "suburb", "neighbourhood", "quarter", "town", "city_district", "district",
      "municipality", "subdistrict", "county", "regency", "city", "state"];
    const seen = new Set(), parts = [];
    for (const k of order) {
      const v = (a[k] || "").trim();
      if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); parts.push(v); }
    }
    if (parts.length && a.postcode) parts[parts.length - 1] += " " + a.postcode;
    if (parts.length >= 2) return parts.join(", ");
    return String(j.display_name || "").replace(/,\s*Indonesia$/i, "");
  }
  async function reverse(lat, lng, force) {
    const cell = cellOf(lat, lng);
    if (!force && addrCache[cell]) return addrCache[cell];
    if (!navigator.onLine) return addrCache[cell] || null;
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=id&lat=${lat}&lon=${lng}`;
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) return addrCache[cell] || null;
      const s = formatAddr(await r.json());
      if (s) { addrCache[cell] = s; try { localStorage.setItem(ADDR_KEY, JSON.stringify(addrCache)); } catch (e) {} }
      return s || null;
    } catch (e) { return addrCache[cell] || null; }
  }

  // ---------- Peta mini (ubin OpenStreetMap, disimpan untuk offline) ----------
  const Z = 17, TILE = 256, TILE_CACHE = "kka-tiles";
  const tileURL = (x, y) => `https://tile.openstreetmap.org/${Z}/${x}/${y}.png`;
  function worldPx(lat, lng) {
    const n = 2 ** Z, r = lat * Math.PI / 180;
    return { x: (lng + 180) / 360 * n * TILE, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n * TILE };
  }
  const mem = new Map(); // url -> ImageBitmap
  async function getTile(x, y) {
    const url = tileURL(x, y);
    if (mem.has(url)) return mem.get(url);
    let blob = null;
    try {
      const c = await caches.open(TILE_CACHE);
      const hit = await c.match(url);
      if (hit) blob = await hit.blob();
      else if (navigator.onLine) {
        const r = await fetch(url, { mode: "cors" });
        if (r.ok) { await c.put(url, r.clone()); blob = await r.blob(); }
      }
    } catch (e) {}
    if (!blob) return null;
    try { const bm = await createImageBitmap(blob); mem.set(url, bm); return bm; } catch (e) { return null; }
  }
  // Ambil ubin di sekitar lokasi lebih dulu (dipanggil saat GPS/koordinat sekolah diketahui & online)
  async function prefetch(lat, lng) {
    const p = worldPx(lat, lng), cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE);
    const jobs = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) jobs.push(getTile(cx + dx, cy + dy));
    await Promise.all(jobs);
  }
  /* Gambar peta persegi berukuran s×s di (x0,y0), titik lokasi di tengah dengan pin merah.
     Bila ubin tidak tersedia (offline & belum tersimpan), tampil kotak gelap dengan pin. */
  async function drawMap(ctx, x0, y0, s, lat, lng) {
    const p = worldPx(lat, lng);
    const span = 300;                      // lebar area peta dalam piksel dunia (zoom 17 ≈ 0,9 m/px di khatulistiwa)
    const k = s / span;
    const left = p.x - span / 2, top = p.y - span / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, s, s); ctx.clip();
    ctx.fillStyle = "#2b3330"; ctx.fillRect(x0, y0, s, s);
    let drawn = 0;
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + span) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + span) / TILE); ty++) {
        const bm = await getTile(tx, ty);
        if (!bm) continue;
        ctx.drawImage(bm, x0 + (tx * TILE - left) * k, y0 + (ty * TILE - top) * k, TILE * k, TILE * k);
        drawn++;
      }
    }
    if (!drawn) { // kisi sederhana agar tetap terbaca sebagai peta
      ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = Math.max(1, s / 120);
      for (let i = 1; i < 4; i++) { const d = s * i / 4; ctx.beginPath(); ctx.moveTo(x0 + d, y0); ctx.lineTo(x0 + d, y0 + s); ctx.moveTo(x0, y0 + d); ctx.lineTo(x0 + s, y0 + d); ctx.stroke(); }
    }
    // pin
    const cx = x0 + s / 2, cy = y0 + s / 2, r = s * 0.07;
    ctx.fillStyle = "#e5372a"; ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1.5, s / 90);
    ctx.beginPath(); ctx.arc(cx, cy - r * 1.6, r, Math.PI, 0); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy - r * 1.6, r * 0.4, 0, Math.PI * 2); ctx.fill();
    // atribusi wajib OpenStreetMap
    const fs = Math.max(8, Math.round(s / 16));
    ctx.font = `600 ${fs}px Arial, sans-serif`; ctx.textAlign = "right";
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(x0 + s - fs * 8.6, y0 + s - fs * 1.4, fs * 8.6, fs * 1.4);
    ctx.fillStyle = "#fff"; ctx.fillText(drawn ? "© OpenStreetMap" : "peta offline", x0 + s - fs * 0.3, y0 + s - fs * 0.35);
    ctx.restore();
    return drawn > 0;
  }

  const cached = (lat, lng) => addrCache[cellOf(lat, lng)] || null;
  window.KKAGeo = { plusCode, shortCode, reverse, prefetch, drawMap, cellOf, cached };
})();

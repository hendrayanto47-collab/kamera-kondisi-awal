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
  /* Sumber peta: "satelit" (citra Esri World Imagery) atau "jalan" (OpenStreetMap). Atribusi dicetak di peta. */
  let source = "satelit";
  const SRC = {
    satelit: { url: (x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${y}/${x}`, attr: "Esri, Maxar" },
    jalan: { url: (x, y) => `https://tile.openstreetmap.org/${Z}/${x}/${y}.png`, attr: "© OpenStreetMap" },
  };
  const tileURL = (x, y) => (SRC[source] || SRC.satelit).url(x, y);
  function setSource(s) { if (SRC[s]) source = s; }
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
  async function drawMap(ctx, x0, y0, s, lat, lng, radius) {
    const p = worldPx(lat, lng);
    const span = 300;                      // lebar area peta dalam piksel dunia (zoom 17 ≈ 0,9 m/px di khatulistiwa)
    const k = s / span;
    const left = p.x - span / 2, top = p.y - span / 2;
    ctx.save();
    ctx.beginPath();
    if (radius) { const r = radius; ctx.moveTo(x0 + r, y0); ctx.arcTo(x0 + s, y0, x0 + s, y0 + s, r); ctx.arcTo(x0 + s, y0 + s, x0, y0 + s, r); ctx.arcTo(x0, y0 + s, x0, y0, r); ctx.arcTo(x0, y0, x0 + s, y0, r); ctx.closePath(); }
    else ctx.rect(x0, y0, s, s);
    ctx.clip();
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
    const label = drawn ? (SRC[source] || SRC.satelit).attr : "peta offline";
    const lw = ctx.measureText(label).width + fs * 0.6;
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(x0 + s - lw, y0 + s - fs * 1.4, lw, fs * 1.4);
    ctx.fillStyle = "#fff"; ctx.fillText(label, x0 + s - fs * 0.3, y0 + s - fs * 0.35);
    ctx.restore();
    return drawn > 0;
  }

  const cached = (lat, lng) => addrCache[cellOf(lat, lng)] || null;

  // ---------- Cap bergaya kamera GPS: kotak peta terpisah + kartu teks ----------
  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/), out = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { out.push(cur); cur = w; } }
    if (cur) out.push(cur);
    if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, "") + "…"; }
    return out;
  }
  function headline(addr, fallback) {
    const parts = String(addr || "").split(",").map(s => s.trim()).filter(Boolean).filter(s => !/^indonesia$/i.test(s));
    if (parts.length >= 3) return `${parts[1]}, ${parts[parts.length - 1].replace(/\s*\d{5}$/, "")}, Indonesia`;
    if (parts.length) return parts.join(", ") + ", Indonesia";
    return fallback || "Indonesia";
  }
  function gmtLabel(d) {
    const o = -d.getTimezoneOffset(), sg = o >= 0 ? "+" : "-", a = Math.abs(o);
    return `GMT ${sg}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  /* d: {lat,lng,acc,src, addr, fallbackHead, when, seconds, note, app, cover, u}
     Digambar menempel di bawah kanvas berukuran W×H. */
  async function drawCard(ctx, W, H, d) {
    const u = d.u || Math.min(W, H) / 720;
    const m = 14 * u, pad = 12 * u, gap = 10 * u;
    const headFs = Math.round(21 * u), bFs = Math.round(14.5 * u), lh = Math.round(bFs * 1.38);
    const two = n => String(n).padStart(2, "0"), w = d.when;
    const hari = w.toLocaleDateString("id-ID", { weekday: "long" });
    let hh = w.getHours(); const ap = hh < 12 ? "AM" : "PM"; hh = hh % 12 || 12;
    const dateTxt = `${hari}, ${two(w.getDate())}/${two(w.getMonth() + 1)}/${w.getFullYear()} ${two(hh)}:${two(w.getMinutes())}${d.seconds ? ":" + two(w.getSeconds()) : ""} ${ap} ${gmtLabel(w)}`;
    const pc = shortCode(plusCode(d.lat, d.lng));
    const addr = String(d.addr || "").replace(/,?\s*Indonesia$/i, "");
    const addrLine = `${pc}${addr ? ", " + addr : ""}, Indonesia`;
    const ll = `Lat ${d.lat.toFixed(6)}° Long ${d.lng.toFixed(6)}°` + (d.src === "sekolah" ? "  (koordinat sekolah)" : d.acc != null ? `  (±${d.acc} m)` : "");
    const head = headline(d.addr, d.fallbackHead);
    let S = 150 * u, lines;
    for (let pass = 0; pass < 2; pass++) {
      const tw = W - m * 2 - S - gap - pad * 2;
      ctx.font = `700 ${headFs}px Arial, sans-serif`;
      const hl = wrap(ctx, head, tw - headFs * 1.6, 2);
      ctx.font = `400 ${bFs}px Arial, sans-serif`;
      const al = wrap(ctx, addrLine, tw, 2), nl = wrap(ctx, "Note : " + (d.note || ""), tw, 2);
      lines = { hl, body: [...al, ll, dateTxt, ...nl] };
      const cardH = pad * 2 + hl.length * headFs * 1.25 + 6 * u + lines.body.length * lh;
      S = Math.min(cardH, W * 0.3);
      lines.cardH = cardH;
    }
    const cardH = lines.cardH, top = H - m - cardH;
    const cx = m + S + gap, cw = W - m - cx;
    const badgeH = 22 * u;
    if (d.cover) { ctx.fillStyle = "rgb(18,20,19)"; ctx.fillRect(0, top - badgeH, W, H - top + badgeH); }
    // peta
    await drawMap(ctx, m, H - m - S, S, d.lat, d.lng, 8 * u);
    // kartu teks
    ctx.fillStyle = "rgba(0,0,0,.58)"; roundRect(ctx, cx, top, cw, cardH, 10 * u); ctx.fill();
    // label aplikasi di pojok kanan atas kartu
    ctx.font = `700 ${Math.round(12 * u)}px Arial, sans-serif`;
    const bt = d.app || "Kamera Revit SD", bw = ctx.measureText(bt).width + 30 * u;
    ctx.fillStyle = "rgba(0,0,0,.72)"; roundRect(ctx, cx + cw - bw - 10 * u, top - badgeH * 0.62, bw, badgeH, 6 * u); ctx.fill();
    ctx.fillStyle = "#f2b705"; ctx.beginPath(); ctx.arc(cx + cw - bw - 10 * u + 11 * u, top - badgeH * 0.62 + badgeH / 2, 5 * u, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(bt, cx + cw - bw - 10 * u + 20 * u, top - badgeH * 0.62 + badgeH * 0.68);
    // judul + bendera
    let y = top + pad + headFs;
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 2 * u;
    ctx.font = `700 ${headFs}px Arial, sans-serif`; ctx.fillStyle = "#fff";
    lines.hl.forEach((l, i) => {
      ctx.fillText(l, cx + pad, y);
      if (i === lines.hl.length - 1) {
        const fx = cx + pad + ctx.measureText(l).width + headFs * 0.4, fw = headFs * 1.1, fh = headFs * 0.72, fy = y - fh * 0.95;
        ctx.shadowBlur = 0; ctx.fillStyle = "#e5372a"; ctx.fillRect(fx, fy, fw, fh / 2); ctx.fillStyle = "#fff"; ctx.fillRect(fx, fy + fh / 2, fw, fh / 2);
        ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = Math.max(1, u); ctx.strokeRect(fx, fy, fw, fh); ctx.shadowBlur = 2 * u; ctx.fillStyle = "#fff";
      }
      y += headFs * 1.25;
    });
    // baris isi: mulai sedikit di bawah judul, sisakan jarak bawah = pad
    y = top + pad + lines.hl.length * headFs * 1.25 + 6 * u + lh * 0.8;
    ctx.font = `400 ${bFs}px Arial, sans-serif`; ctx.fillStyle = "rgba(255,255,255,.92)";
    for (const l of lines.body) { ctx.fillText(l, cx + pad, y, cw - pad * 2); y += lh; }
    ctx.shadowBlur = 0;
    return cardH + m + badgeH;
  }

  window.KKAGeo = { plusCode, shortCode, reverse, prefetch, drawMap, cellOf, cached, setSource, drawCard };
})();

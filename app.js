/* Kamera Foto Kondisi Awal — Revitalisasi SD 2026
   Semua data (identitas, daftar paket, foto) disimpan di HP itu sendiri:
   identitas & paket di localStorage, foto di IndexedDB. */

const APP_VERSION = "1.2.0 · 8 Nov 2026";

// ---------- Data dasar ----------
/* 4 foto WAJIB bangunan, sesuai "Form Unggah Dokumentasi 0%" (contoh foto Bangunan):
   Tampak Depan, Tampak Serong Kanan 45°, Tampak Serong Kiri 45°, Tampak Belakang. */
const ANGLES = [
  { k: "depan",       l: "Tampak Depan",            d: "Lurus menghadap fasad" },
  { k: "serongkanan", l: "Tampak Serong Kanan 45°", d: "Dari pojok depan kanan" },
  { k: "serongkiri",  l: "Tampak Serong Kiri 45°",  d: "Dari pojok depan kiri" },
  { k: "belakang",    l: "Tampak Belakang",         d: "Sisi belakang bangunan" },
];
// Foto tambahan (tidak dihitung wajib): kondisi di dalam ruangan
const EXTRA = { k: "ruang", l: "Dalam Ruangan", d: "Tambahan · lantai, dinding, plafon", extra: true };
// Foto dari versi lama ("Tampak Samping") tetap disimpan & ikut diunduh, tapi perlu diambil ulang sebagai serong 45°
const LEGACY = { k: "samping", l: "Tampak Samping (versi lama)", d: "Ambil ulang sebagai serong 45°", extra: true, legacy: true };
const ALL_ANGLES = [...ANGLES, EXTRA, LEGACY];
const angleOf = k => ALL_ANGLES.find(a => a.k === k);
const hasRoom = p => p.grup !== "Lingkungan";
function slotsFor(p) {
  const s = ANGLES.slice();
  if (hasRoom(p) || photos.has(p.id + "|ruang")) s.push(EXTRA);
  if (photos.has(p.id + "|samping")) s.push(LEGACY);
  return s;
}
const SVG = {
  depan: '<svg viewBox="0 0 60 44" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 20 30 6l24 14"/><rect x="10" y="20" width="40" height="20"/><rect x="26" y="27" width="8" height="13"/><rect x="14" y="25" width="7" height="6"/><rect x="39" y="25" width="7" height="6"/></svg>',
  belakang: '<svg viewBox="0 0 60 44" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 20 30 6l24 14"/><rect x="10" y="20" width="40" height="20"/><rect x="16" y="25" width="10" height="6"/><rect x="34" y="25" width="10" height="6"/></svg>',
  serongkanan: '<svg viewBox="0 0 60 44" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18 22 6h30l-6 12"/><path d="M4 18h28v22H4zM32 18l14-12v22L32 40"/><rect x="10" y="24" width="7" height="6"/><rect x="36" y="20" width="5" height="7"/></svg>',
  serongkiri: '<svg viewBox="0 0 60 44" fill="none" stroke="currentColor" stroke-width="2"><path d="M56 18 38 6H8l6 12"/><path d="M56 18H28v22h28zM28 18 14 6v22l14 12"/><rect x="43" y="24" width="7" height="6"/><rect x="19" y="20" width="5" height="7"/></svg>',
  samping: '<svg viewBox="0 0 60 44" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 16h44l-6-10H14z"/><rect x="12" y="16" width="36" height="24"/><rect x="18" y="22" width="8" height="7"/><rect x="34" y="22" width="8" height="7"/></svg>',
  ruang: '<svg viewBox="0 0 60 44" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 4l12 10h20L52 4M8 40l12-10h20l12 10"/><rect x="20" y="14" width="20" height="16"/></svg>',
};
const GROUPS = ["Ruang kelas", "Ruang administrasi", "Lingkungan", "Lainnya"];
const DEFAULT_PAKET = [
  ...[1, 2, 3, 4, 5, 6].map(n => ({ id: "kelas" + n, nama: "Kelas " + n, grup: "Ruang kelas" })),
  { id: "ruangguru", nama: "Ruang guru", grup: "Ruang administrasi" },
  { id: "lingkungan", nama: "Penataan lingkungan", grup: "Lingkungan" },
];
const DEFAULT_PROFIL = { nama: "", npsn: "", wil: "" };
const STORE_KEY = "kka-state-v2";

let paket = DEFAULT_PAKET.slice();
let profil = { ...DEFAULT_PROFIL };
/* "paketId|sudut" -> {blob, t, url, lat, lng, acc, hash, warn, synced, path, prevPath}
   hash    : sidik jari gambar untuk mendeteksi foto kembar
   warn    : daftar peringatan pemeriksaan yang tetap disimpan oleh operator
   synced  : sudah terkirim ke Supabase
   path    : lokasi file di bucket Supabase
   prevPath: file lama di Supabase yang perlu dihapus setelah foto diulang */
const photos = new Map();
const REC_FIELDS = ["blob", "orig", "t", "lat", "lng", "acc", "hash", "warn", "synced", "path", "prevPath"];
function persist(k) {
  const ph = photos.get(k); if (!ph) return dbPut(k, null);
  const rec = {}; REC_FIELDS.forEach(f => (rec[f] = ph[f])); dbPut(k, rec);
}

try {
  const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  if (s) { paket = s.paket || paket; profil = { ...profil, ...s.profil }; }
} catch (e) {}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ paket, profil })); } catch (e) {}
}

// ---------- IndexedDB untuk foto ----------
let idb = null;
function openDb() {
  return new Promise(res => {
    try {
      const r = indexedDB.open("kka", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("p");
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
function dbPut(k, v) {
  try {
    if (!idb) return;
    const st = idb.transaction("p", "readwrite").objectStore("p");
    v == null ? st.delete(k) : st.put(v, k);
  } catch (e) {}
}
function dbLoad() {
  return new Promise(res => {
    if (!idb) return res();
    try {
      const rq = idb.transaction("p", "readwrite").objectStore("p").openCursor();
      rq.onsuccess = () => {
        const c = rq.result;
        if (!c) return res();
        const v = c.value;
        let key = c.key;
        // Migrasi versi lama: slot "Dalam Ruang" (dalam) → "Dalam Ruangan" (ruang)
        if (typeof key === "string" && key.endsWith("|dalam")) {
          key = key.replace(/\|dalam$/, "|ruang");
          try { c.delete(); } catch (e) {}
          if (v && v.blob) dbPut(key, v);
        }
        if (v && v.blob) photos.set(key, { ...v, t: v.t || Date.now(), url: URL.createObjectURL(v.blob) });
        c.continue();
      };
      rq.onerror = () => res();
    } catch (e) { res(); }
  });
}

// ---------- Helper ----------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const two = n => String(n).padStart(2, "0");
const tgl = ms => { const d = new Date(ms); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
const jam = ms => { const d = new Date(ms); return `${two(d.getHours())}.${two(d.getMinutes())}`; };
const clean = t => String(t).replace(/[\\/:*?"<>|]+/g, "-").trim();
function zoneLabel(d) {
  const o = -d.getTimezoneOffset() / 60;
  return o === 7 ? "WIB" : o === 8 ? "WITA" : o === 9 ? "WIT" : "UTC" + (o >= 0 ? "+" : "") + o;
}
function fmtDate(d) {
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) +
    " · " + `${two(d.getHours())}:${two(d.getMinutes())}` + " " + zoneLabel(d);
}
let tt;
function toast(m) {
  const t = $("toast"); t.textContent = m; t.hidden = false;
  clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), 3200);
}

// ---------- Identitas ----------
const fmap = { pNama: "nama", pNpsn: "npsn", pWil: "wil", pKoor: "koor" };
for (const [id, k] of Object.entries(fmap)) {
  $(id).value = profil[k] || "";
  $(id).addEventListener("input", e => { profil[k] = e.target.value; saveState(); });
}
$("aGrup").innerHTML = GROUPS.map(g => `<option>${g}</option>`).join("");

// ---------- GPS ----------
let fix = null, watchId = null;
const GPS_OPT = { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 };
const HELP_APPROX =
  "HP hanya memberi lokasi perkiraan. Di Android: Pengaturan → Aplikasi → Chrome → Izin → Lokasi → aktifkan \"Gunakan lokasi akurat\". " +
  "Nyalakan juga Lokasi dan \"Akurasi lokasi Google\" di pengaturan Lokasi HP, lalu ketuk Cari ulang di luar ruangan.";
const HELP_DENIED =
  "Izin lokasi ditolak. Ketuk ikon gembok/pengaturan di samping alamat situs → Izin → Lokasi → Izinkan, lalu ketuk Cari ulang.";

function onFix(p) {
  const nf = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), t: Date.now() };
  // Simpan yang lebih akurat; lokasi lama yang akurat tetap dipakai sampai 5 menit
  if (!fix || nf.acc <= fix.acc || Date.now() - fix.t > 300000) fix = nf;
  else fix.t = Date.now();
  renderGps();
}
function onGpsErr(err) {
  if (err.code === 1) { setGps("err", "Izin lokasi ditolak."); showHelp(HELP_DENIED); }
  else if (!fix) setGps("err", "GPS belum dapat sinyal. Coba di luar ruangan.");
  $("gpsRetry").hidden = false;
}
function renderGps() {
  if (!fix) return;
  $("gpsBtn").hidden = true; $("gpsRetry").hidden = false;
  if (fix.acc <= KKA.LIMIT.gpsAcc) {
    setGps("on", `GPS ${fix.lat.toFixed(6)}, ${fix.lng.toFixed(6)} (±${fix.acc} m)`); showHelp("");
  } else {
    setGps("err", `Akurasi rendah ±${fix.acc} m${schoolKoor() ? " · foto memakai koordinat sekolah" : ""}`);
    showHelp(fix.acc >= 500 ? HELP_APPROX : "Tunggu sebentar di area terbuka, jauh dari atap seng, sampai angkanya di bawah ±50 m.");
  }
}
function showHelp(t) { $("gpsHelp").textContent = t; $("gpsHelp").hidden = !t; }
function startGps() {
  if (!("geolocation" in navigator)) { setGps("err", "HP ini tidak mendukung GPS di browser"); return; }
  if (!window.isSecureContext) { setGps("err", "GPS butuh alamat https://"); return; }
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  setGps("", "Mencari sinyal GPS… (bisa 1–2 menit, sebaiknya di luar ruangan)");
  watchId = navigator.geolocation.watchPosition(onFix, onGpsErr, GPS_OPT);
}
// Minta posisi segar (dipanggil saat kamera dibuka; HP mencari GPS selama operator memotret)
function refreshGps() {
  if (watchId == null || !("geolocation" in navigator)) return;
  navigator.geolocation.getCurrentPosition(onFix, () => {}, GPS_OPT);
}
function setGps(cls, text) { $("gpsDot").className = "dot " + cls; $("gpsText").textContent = text; }
$("gpsBtn").addEventListener("click", startGps);
$("gpsRetry").addEventListener("click", () => { fix = null; startGps(); });

/* Koordinat sekolah cadangan: terima "-2.486486, 115.135429", tautan Google Maps "@-2.48,115.13", dll. */
function schoolKoor() {
  const nums = ((profil.koor || "").match(/-?\d+\.\d+/g) || []).map(Number);
  if (nums.length < 2) return null;
  const [lat, lng] = nums;
  if (lat < -11.5 || lat > 6.5 || lng < 94 || lng > 141.5) return null; // di luar Indonesia
  return { lat, lng };
}
$("pKoor").addEventListener("change", () => {
  const k = schoolKoor();
  if (profil.koor && !k) toast("Format koordinat belum dikenali. Contoh: -2.486486, 115.135429");
  else if (k) toast(`Koordinat sekolah tersimpan: ${k.lat.toFixed(6)}, ${k.lng.toFixed(6)}`);
  renderGps(); render();
});
if (navigator.permissions) {
  navigator.permissions.query({ name: "geolocation" }).then(s => { if (s.state === "granted") startGps(); }).catch(() => {});
}

// ---------- Tampilan daftar ----------
function render() {
  const list = $("list"); list.innerHTML = "";
  let last = null;
  for (const p of paket) {
    if (p.grup !== last) {
      const h = document.createElement("p"); h.className = "group-title"; h.textContent = p.grup;
      list.appendChild(h); last = p.grup;
    }
    const n = ANGLES.filter(a => photos.has(p.id + "|" + a.k)).length;
    const slots = slotsFor(p);
    const el = document.createElement("article");
    el.className = "paket" + (n === 4 ? " done" : "");
    el.innerHTML = `<div class="ph"><h3>${esc(p.nama)}</h3><span class="chip">${n}/4 wajib</span>
      <button class="iconbtn" data-del="${esc(p.id)}" type="button" aria-label="Hapus paket ${esc(p.nama)}">Hapus</button></div>
      <div class="slots">${slots.map(a => {
        const ph = photos.get(p.id + "|" + a.k);
        return `<div class="slot${a.extra ? " extra" : ""}${a.legacy ? " legacy" : ""}">
          <button class="shot${ph ? " has" : ""}" type="button" data-shoot="${esc(p.id)}|${a.k}" aria-label="${ph ? "Lihat" : "Ambil"} foto ${a.l} ${esc(p.nama)}">
            ${ph ? `<img src="${ph.url}" alt="">` : SVG[a.k]}<span class="cam">${ph ? "Lihat" : "Ambil foto"}</span>
            ${ph && window.SB && SB.enabled ? `<span class="sync${ph.synced ? " ok" : ""}">${ph.synced ? "Terkirim" : "Antre"}</span>` : ""}
            ${ph && ph.warn && ph.warn.length ? `<span class="warnb" title="${esc(ph.warn.join(" "))}">${ph.warn.length} catatan</span>` : ""}</button>
          <div class="slab"><span>${a.l}</span>${ph
            ? `<button type="button" data-retake="${esc(p.id)}|${a.k}">Ulangi</button>`
            : `<button type="button" class="gbtn" data-guide="${esc(p.id)}|${a.k}">Panduan</button>`}</div>
        </div>`;
      }).join("")}</div>`;
    list.appendChild(el);
  }
  const total = paket.length * 4;
  const cnt = paket.reduce((s, p) => s + ANGLES.filter(a => photos.has(p.id + "|" + a.k)).length, 0);
  const anyPhoto = [...photos.keys()].some(k => paket.some(p => k.startsWith(p.id + "|")));
  $("tCount").textContent = cnt; $("tTotal").textContent = total;
  $("tBar").style.width = total ? (cnt / total) * 100 + "%" : "0";
  renderCloud(); renderFix();
  $("zipBtn").disabled = !anyPhoto;
  const kurang = paket.filter(p => ANGLES.some(a => !photos.has(p.id + "|" + a.k))).length;
  $("dockMsg").textContent = !profil.nama
    ? "Isi dulu nama sekolah dan NPSN, lalu ketuk kotak foto untuk membuka kamera."
    : !anyPhoto ? "Ketuk kotak foto untuk membuka kamera. Foto langsung diberi cap identitas."
    : kurang ? `${kurang} menu paket belum lengkap 4 foto wajib bangunan. Laporan tidak dapat dikirim bila ada yang kurang.`
    : "Semua menu paket lengkap. Unduh lalu unggah ke tab Foto Kondisi Awal.";
}

// ---------- Aksi pada daftar ----------
let target = null;
function openCamera(k) { target = k; refreshGps(); $("picker").value = ""; $("picker").click(); }

// Panduan posisi
let guideOn = true;
try { guideOn = localStorage.getItem("kka-guide") !== "0"; } catch (e) {}
$("optGuide").checked = guideOn;
$("optGuide").addEventListener("change", e => {
  guideOn = e.target.checked;
  try { localStorage.setItem("kka-guide", guideOn ? "1" : "0"); } catch (e) {}
});
let guideKey = null;
function showGuide(k, withCamera) {
  const [pid, ak] = k.split("|");
  const p = paket.find(q => q.id === pid), a = angleOf(ak);
  guideKey = k;
  $("gEyebrow").textContent = `Panduan posisi · ${p.nama}`;
  $("gTitle").textContent = a.l;
  $("gFig").innerHTML = KKA.PLAN[a.k];
  $("gTips").innerHTML = KKA.GUIDE[a.k].tips.map(t => `<li>${esc(t)}</li>`).join("") +
    KKA.COMMON.map(t => `<li class="common">${esc(t)}</li>`).join("");
  $("gGo").textContent = withCamera ? "Buka kamera" : "Ambil foto sekarang";
  $("guide").hidden = false;
  $("gGo").focus();
}
function openShoot(k) { guideOn ? showGuide(k, true) : openCamera(k); }
$("gGo").addEventListener("click", () => { $("guide").hidden = true; openCamera(guideKey); });
$("gCancel").addEventListener("click", () => ($("guide").hidden = true));

$("list").addEventListener("click", e => {
  const r = e.target.closest("[data-retake]"), s = e.target.closest("[data-shoot]"), d = e.target.closest("[data-del]"),
    g = e.target.closest("[data-guide]");
  if (g) return showGuide(g.dataset.guide, false);
  if (r) return openShoot(r.dataset.retake);
  if (s) { photos.has(s.dataset.shoot) ? openViewer(s.dataset.shoot) : openShoot(s.dataset.shoot); return; }
  if (d) {
    const id = d.dataset.del;
    if (d.dataset.armed) {
      paket = paket.filter(p => p.id !== id);
      ALL_ANGLES.forEach(a => { const k = id + "|" + a.k; photos.delete(k); dbPut(k, null); });
      // Catatan: foto yang sudah terkirim tetap ada di Supabase; hapus manual di dashboard bila perlu.
      saveState(); render();
    } else {
      d.dataset.armed = 1; d.textContent = "Yakin hapus?";
      setTimeout(() => { if (d.isConnected) { delete d.dataset.armed; d.textContent = "Hapus"; } }, 3000);
    }
  }
});
$("aBtn").addEventListener("click", () => {
  const nm = $("aNama").value.trim();
  if (!nm) { $("aNama").focus(); return; }
  const grup = $("aGrup").value;
  let id = nm.toLowerCase().replace(/[^a-z0-9]+/g, "") || "paket";
  while (paket.some(p => p.id === id)) id += "x";
  const idx = paket.map(p => p.grup).lastIndexOf(grup);
  const item = { id, nama: nm, grup };
  idx < 0 ? paket.push(item) : paket.splice(idx + 1, 0, item);
  $("aNama").value = ""; saveState(); render(); toast("Paket " + nm + " ditambahkan");
});

// ---------- Cap foto ----------
async function loadImage(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) {}
  }
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
}
/* Waktu pengambilan: tanggal file dari kamera. Foto yang baru dipotret = waktu sekarang;
   foto lama dari galeri tetap memakai tanggal aslinya (dan diberi peringatan). */
function takenTime(file) {
  const lm = file.lastModified;
  return lm && lm > Date.UTC(2020, 0, 1) && lm <= Date.now() + 6e4 ? lm : Date.now();
}
/* Lokasi untuk foto:
   1) GPS HP bila akurat (≤ 50 m)            → src "gps"
   2) koordinat sekolah bila diisi           → src "sekolah" (GPS HP dicatat di acc bila ada)
   3) GPS HP yang kurang akurat              → src "gps" dengan ±akurasi apa adanya
   Lokasi lebih tua dari 5 menit dianggap tidak ada. */
function currentGps() {
  const live = fix && Date.now() - fix.t < 300000 ? fix : null;
  if (live && live.acc <= KKA.LIMIT.gpsAcc) return { ...live, src: "gps" };
  const sk = schoolKoor();
  if (sk) return { lat: sk.lat, lng: sk.lng, acc: null, phoneAcc: live ? live.acc : null, src: "sekolah" };
  return live ? { ...live, src: "gps" } : null;
}

/* opts.cover = true: gambar sumber sudah bercap (foto lama), jadi cap lama ditutup penuh dulu.
   Selain itu, salinan foto TANPA cap ikut disimpan (orig) agar cap bisa dicetak ulang dengan bersih. */
async function stamp(img, takenAt, gps, p, a, opts = {}) {
  const sc = Math.min(1, 1920 / Math.max(img.width, img.height));
  const W = Math.round(img.width * sc), H = Math.round(img.height * sc);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0, W, H);
  const orig = opts.cover ? null : await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));

  /* Cap ringkas: 3 baris, tinggi ±15% foto berapa pun rasionya (4:3, 16:9, 20:9, portrait).
     Ukuran huruf mengikuti sisi TERPENDEK foto agar foto lebar tidak tertutup. */
  const u = Math.min(W, H) / 720;
  const pad = Math.round(14 * u), left = Math.round(22 * u), maxW = W - left - pad;
  const tFs = Math.round(26 * u), bFs = Math.round(18 * u), lh = Math.round(bFs * 1.4);
  const when = new Date(takenAt);
  const tglPendek = when.toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
  const gpsTxt = !gps ? "GPS tidak tersedia"
    : gps.src === "sekolah" ? `Koord. sekolah ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`
    : `GPS ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)} (±${gps.acc} m)`;
  const lines = [
    [profil.nama || "-", "NPSN " + (profil.npsn || "-"), profil.wil].filter(Boolean).join("  ·  "),
    `${tglPendek}  ${two(when.getHours())}:${two(when.getMinutes())} ${zoneLabel(when)}  ·  ${gpsTxt}`,
  ];
  const bandH = pad * 2 + Math.round(tFs * 1.15) + lh * lines.length;
  const top = H - bandH;
  // Latar gradasi: makin ke bawah makin gelap, foto tetap terlihat di bagian atas pita
  const gr = x.createLinearGradient(0, top - 24 * u, 0, H);
  gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.25, "rgba(0,0,0,.62)"); gr.addColorStop(1, "rgba(0,0,0,.78)");
  x.fillStyle = gr; x.fillRect(0, top - 24 * u, W, bandH + 24 * u);
  if (opts.cover) { x.fillStyle = "rgb(18,20,19)"; x.fillRect(0, top - 6 * u, W, bandH + 6 * u); }
  x.fillStyle = "#f2b705"; x.fillRect(0, top + pad * 0.6, Math.round(6 * u), bandH - pad * 1.2);
  x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 3 * u;
  // Baris 1: sudut — paket (kuning) + label program di kanan bila muat
  let y = top + pad + tFs;
  x.font = `800 ${tFs}px Arial, sans-serif`; x.fillStyle = "#f2b705"; x.textAlign = "left";
  const title = `${a.l.toUpperCase()} — ${p.nama.toUpperCase()}`;
  x.fillText(title, left, y, maxW);
  const tag = "KONDISI AWAL 0% · REVITALISASI SD 2026";
  x.font = `700 ${Math.round(bFs * 0.8)}px Arial, sans-serif`;
  const titleW = (x.font = `800 ${tFs}px Arial, sans-serif`, x.measureText(title).width);
  x.font = `700 ${Math.round(bFs * 0.8)}px Arial, sans-serif`;
  const tagW = x.measureText(tag).width;
  const tagOnTitle = left + titleW + 30 * u + tagW <= W - pad;
  if (tagOnTitle) { x.fillStyle = "rgba(255,255,255,.85)"; x.textAlign = "right"; x.fillText(tag, W - pad, y); x.textAlign = "left"; }
  else lines[0] += "  ·  Kondisi Awal 0%";
  // Baris 2–3: identitas, waktu & GPS
  x.fillStyle = "#ffffff"; x.font = `500 ${bFs}px Arial, sans-serif`;
  y += Math.round(tFs * 0.15);
  for (const l of lines) { y += lh; x.fillText(l, left, y - lh * 0.22, maxW); }
  x.shadowBlur = 0;

  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
  const res = { blob, t: when.getTime(), lat: gps ? gps.lat : null, lng: gps ? gps.lng : null, acc: gps ? gps.acc : null };
  if (orig) res.orig = orig;
  return res;
}

// ---------- Cetak ulang cap untuk foto tanpa koordinat ----------
const noKoorKeys = () => [...photos.entries()]
  .filter(([k, ph]) => ph.lat == null && paket.some(q => k.startsWith(q.id + "|"))).map(([k]) => k);
function renderFix() {
  const n = noKoorKeys().length, sk = schoolKoor();
  $("fixBox").hidden = n === 0;
  if (!n) return;
  $("fixText").textContent = sk
    ? `${n} foto tersimpan tanpa koordinat. Cetak koordinat sekolah ke foto-foto itu? Tanggal & jam asli tidak berubah.`
    : `${n} foto tersimpan tanpa koordinat. Kolom "Koordinat sekolah" masih kosong: isi dulu (lintang, bujur dari Dapodik atau Google Maps), lalu tombol cetak akan aktif.`;
  $("fixBtn").hidden = !sk; $("fixBtn").disabled = !sk;
  $("fixFill").hidden = !!sk;
  $("fixBtn").textContent = `Cetak koordinat sekolah ke ${n} foto`;
}
$("fixFill").addEventListener("click", () => {
  $("pKoor").scrollIntoView({ block: "center" }); $("pKoor").focus();
});
// Tombol cetak langsung aktif begitu koordinat valid diketik (tanpa harus keluar dari kolom)
$("pKoor").addEventListener("input", () => renderFix());
$("fixBtn").addEventListener("click", async () => {
  const sk = schoolKoor(); if (!sk) return;
  const keys = noKoorKeys(); let ok = 0;
  $("fixBtn").disabled = true;
  for (const k of keys) {
    const ph = photos.get(k);
    const [pid, ak] = k.split("|");
    const p = paket.find(q => q.id === pid), a = angleOf(ak);
    try {
      const src = ph.orig || ph.blob;
      const img = await createImageBitmap(src);
      const res = await stamp(img, ph.t, { ...sk, acc: null, src: "sekolah" }, p, a, { cover: !ph.orig });
      URL.revokeObjectURL(ph.url);
      const warn = (ph.warn || []).filter(w => !/GPS|koordinat/i.test(w)).concat("GPS HP tidak tersedia saat memotret; dicetak koordinat sekolah.");
      photos.set(k, { ...ph, blob: res.blob, lat: sk.lat, lng: sk.lng, acc: null, warn,
        synced: false, prevPath: ph.synced ? ph.path : ph.prevPath, url: URL.createObjectURL(res.blob) });
      persist(k); ok++;
    } catch (e) {}
  }
  render(); toast(`${ok} foto diperbarui dengan koordinat sekolah.`); syncAll();
});

// ---------- Ambil → periksa → simpan ----------
let pending = null; // {key, rec, url}
const labelOf = k => {
  const [pid, ak] = k.split("|");
  const p = paket.find(q => q.id === pid), a = angleOf(ak);
  return p && a ? `${a.l} ${p.nama}` : k;
};
$("picker").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0];
  if (!f || !target) return;
  const key = target;
  const [pid, ak] = key.split("|");
  const p = paket.find(q => q.id === pid), a = angleOf(ak);
  try {
    toast("Memeriksa foto…");
    const img = await loadImage(f);
    const info = KKA.analyze(img);
    const takenAt = takenTime(f);
    const gps = currentGps();
    // Foto kembar diperiksa dalam paket yang sama (beberapa ruang kelas bisa berada di gedung yang sama)
    const others = [...photos.entries()]
      .filter(([k, ph]) => k !== key && k.startsWith(pid + "|"))
      .map(([k, ph]) => ({ label: labelOf(k), hash: ph.hash, lat: ph.lat, lng: ph.lng }));
    const checks = KKA.runChecks({ info, takenAt, gps, others });
    const res = await stamp(img, takenAt, gps, p, a);
    const warn = checks.filter(c => !c.ok).map(c => c.text);
    if (pending) URL.revokeObjectURL(pending.url);
    pending = { key, rec: { ...res, hash: info.hash, warn }, url: URL.createObjectURL(res.blob) };
    showReview(p, a, checks);
  } catch (err) {
    toast("Foto tidak bisa dibaca. Coba ambil ulang atau pilih format JPG/PNG.");
  }
});
function showReview(p, a, checks) {
  const nWarn = checks.filter(c => !c.ok).length;
  const blocked = checks.some(c => c.block);
  pending.blocked = blocked;
  $("rTitle").textContent = `${a.l} — ${p.nama}`;
  $("rImg").src = pending.url;
  $("rChecks").innerHTML = checks
    .sort((x, y) => x.ok - y.ok)
    .sort((x, y) => (y.block ? 1 : 0) - (x.block ? 1 : 0))
    .map(c => `<li class="${c.ok ? "" : "w"}${c.block ? " b" : ""}">${esc(c.text)}</li>`).join("");
  // Bila ada peringatan, tombol utama menjadi "Ambil ulang"
  $("rSave").hidden = blocked;
  $("rSave").textContent = nWarn ? "Tetap simpan" : "Simpan foto";
  $("rSave").className = "btn" + (nWarn ? "" : " primary");
  $("rRetake").className = "btn" + (nWarn ? " primary" : "");
  $("toast").hidden = true;
  $("review").hidden = false;
  (nWarn ? $("rRetake") : $("rSave")).focus();
}
function closeReview() {
  $("review").hidden = true;
  if (pending) { URL.revokeObjectURL(pending.url); pending = null; }
}
$("rSave").addEventListener("click", () => {
  if (!pending || pending.blocked) return;
  const { key, rec, url } = pending;
  const old = photos.get(key);
  if (old) URL.revokeObjectURL(old.url);
  const prevPath = old ? (old.synced ? old.path : old.prevPath) || null : null;
  photos.set(key, { ...rec, synced: false, path: null, prevPath, url });
  pending = null;
  $("review").hidden = true;
  persist(key); render();
  toast(`${labelOf(key)} tersimpan (${Math.round(rec.blob.size / 1024)} KB)`);
  syncAll();
});
$("rRetake").addEventListener("click", () => { const k = pending ? pending.key : target; closeReview(); openCamera(k); });
$("rCancel").addEventListener("click", closeReview);

// ---------- Nama file & unduhan ----------
/* Contoh: 2026-11-03 09.12 - Kelas 1 - Tampak Depan.jpg */
function fname(k) {
  const [pid, ak] = k.split("|");
  const p = paket.find(q => q.id === pid), a = angleOf(ak), ph = photos.get(k);
  return `${tgl(ph.t)} ${jam(ph.t)} - ${clean(p.nama)} - ${a.l}.jpg`;
}
function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast("Diunduh: " + filename);
}

let vKey = null;
function openViewer(k) { vKey = k; $("vImg").src = photos.get(k).url; $("vImg").alt = fname(k); $("viewer").hidden = false; }
$("vClose").onclick = () => ($("viewer").hidden = true);
$("viewer").addEventListener("click", e => { if (e.target.id === "viewer") $("viewer").hidden = true; });
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  $("viewer").hidden = true; $("guide").hidden = true;
  if (!$("review").hidden) closeReview();
});
$("vSave").onclick = () => download(fname(vKey), photos.get(vKey).blob);

/* ZIP: Foto Kondisi Awal - <Sekolah>/<Nama paket>/<tanggal jam - paket - sudut>.jpg */
$("zipBtn").onclick = async () => {
  const rootName = `Foto Kondisi Awal - ${clean(profil.nama || "Sekolah")}`;
  const entries = []; let first = Infinity;
  for (const p of paket) {
    for (const a of ALL_ANGLES) {
      const k = p.id + "|" + a.k, ph = photos.get(k);
      if (!ph) continue;
      first = Math.min(first, ph.t);
      entries.push({ path: `${rootName}/${clean(p.nama)}/${fname(k)}`, blob: ph.blob, date: new Date(ph.t) });
    }
  }
  toast("Menyusun ZIP…");
  const blob = await window.makeZip(entries);
  download(`${rootName} - ${tgl(first)}.zip`, blob);
};

// ---------- Sinkronisasi Supabase ----------
/* Folder di bucket: "<NPSN> - <Nama Sekolah>/<Nama paket>/<tanggal jam - paket - sudut>.jpg" */
const schoolFolder = () => clean(`${profil.npsn || "tanpa-npsn"} - ${profil.nama || "Sekolah"}`);
let syncing = false;

async function syncAll(manual) {
  if (!window.SB || !SB.enabled || !SB.session || syncing) return;
  if (!navigator.onLine) { if (manual) toast("Tidak ada internet. Foto akan dikirim otomatis saat online."); return; }
  if (!profil.npsn || !profil.nama) { if (manual) toast("Isi nama sekolah dan NPSN dulu."); return; }
  syncing = true; renderCloud();
  let ok = 0, err = null;
  for (const [k, ph] of photos) {
    if (ph.synced) continue;
    const [pid, ak] = k.split("|");
    const p = paket.find(q => q.id === pid), a = angleOf(ak);
    if (!p || !a) continue;
    const path = `${schoolFolder()}/${clean(p.nama)}/${fname(k)}`;
    try {
      await SB.upload(path, ph.blob);
      await SB.upsertRow({
        npsn: profil.npsn, nama_sekolah: profil.nama, wilayah: profil.wil || null,
        paket: p.nama, sudut: a.l, diambil_pada: new Date(ph.t).toISOString(),
        lat: ph.lat ?? null, lng: ph.lng ?? null, akurasi_m: ph.acc ?? null,
        storage_path: path, diperbarui: new Date().toISOString(),
      });
      if (ph.prevPath && ph.prevPath !== path) await SB.remove(ph.prevPath).catch(() => {});
      if (photos.get(k) === ph) { ph.synced = true; ph.path = path; ph.prevPath = null; persist(k); }
      ok++; render();
    } catch (e) {
      err = e.message;
      if (/login|internet/i.test(err)) break;
    }
  }
  syncing = false; renderCloud(); render();
  if (err) toast(err);
  else if (ok) toast(`${ok} foto terkirim ke Supabase.`);
  else if (manual) toast("Semua foto sudah terkirim.");
}

function renderCloud() {
  if (!window.SB || !SB.enabled) return;
  $("cloudPanel").hidden = false;
  const s = SB.session;
  $("loginForm").hidden = !!s; $("loggedIn").hidden = !s;
  if (s) {
    const antre = [...photos.values()].filter(ph => !ph.synced).length;
    $("sbUser").textContent = `${s.email} · ${syncing ? "mengirim…" : antre ? antre + " foto antre" : "semua terkirim"}`;
    $("sbSync").disabled = syncing;
  }
}
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("sbLogin").disabled = true;
  try { await SB.login($("sbEmail").value.trim(), $("sbPass").value); $("sbPass").value = ""; toast("Berhasil masuk."); renderCloud(); syncAll(); }
  catch (err) { toast(navigator.onLine ? err.message : "Butuh internet untuk login pertama kali."); }
  $("sbLogin").disabled = false;
});
$("sbSync").addEventListener("click", () => syncAll(true));
$("sbOut").addEventListener("click", async () => { await SB.logout(); renderCloud(); toast("Sudah keluar."); });
window.addEventListener("online", () => syncAll());

// ---------- Pasang sebagai aplikasi (PWA) ----------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; $("installBtn").hidden = false; });
$("installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $("installBtn").hidden = true;
});
// ---------- Pembaruan aplikasi ----------
/* Saat versi baru diunggah ke Netlify, service worker baru aktif sendiri.
   Bila halaman ini masih versi lama, tampilkan banner "Versi baru tersedia". */
$("ver").textContent = APP_VERSION;
if ("serviceWorker" in navigator && window.isSecureContext) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").then(reg => {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) $("updBar").hidden = false; });
}
$("updBtn").addEventListener("click", () => {
  if (pending || !$("review").hidden) { toast("Simpan atau batalkan foto yang sedang ditinjau dulu."); return; }
  location.reload();
});

// ---------- Mulai ----------
render(); renderCloud();
openDb().then(async d => { idb = d; await dbLoad(); render(); renderCloud(); syncAll(); });

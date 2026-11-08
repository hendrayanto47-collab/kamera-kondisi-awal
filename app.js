/* Kamera Foto Kondisi Awal — Revitalisasi SD 2026
   Semua data (identitas, daftar paket, foto) disimpan di HP itu sendiri:
   identitas & paket di localStorage, foto di IndexedDB. */

const APP_VERSION = "1.8.2 · 8 Nov 2026";

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

/* Tahap dokumentasi. Kunci foto:
   0%      → "paket|sudut"            (sama seperti versi lama, foto lama tetap terbaca)
   25–100% → "@50|paket|sudut"
   Kegiatan→ "#keg|<id>"               */
/* Tahap bisa diatur sendiri oleh operator (0% selalu ada). Disimpan di HP. */
const DEFAULT_STAGES = [0, 25, 50, 75, 100];
let STAGES = DEFAULT_STAGES.slice();
try {
  const st = JSON.parse(localStorage.getItem("kka-stages") || "null");
  if (Array.isArray(st) && st.length) STAGES = [...new Set([0, ...st.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 100)])].sort((a, b) => a - b);
} catch (e) {}
function saveStages() { try { localStorage.setItem("kka-stages", JSON.stringify(STAGES)); } catch (e) {} }
const KEY = (pid, ak, st) => (st ? `@${st}|${pid}|${ak}` : `${pid}|${ak}`);
function parseKey(k) {
  if (k.startsWith("#keg|")) return { keg: true, id: k.slice(5), st: null };
  if (k.startsWith("@")) { const [s, pid, ak] = k.split("|"); return { st: +s.slice(1), pid, ak }; }
  const [pid, ak] = k.split("|"); return { st: 0, pid, ak };
}
const stageTag = st => (st === 0 ? "KONDISI AWAL 0%" : st === 100 ? "PROGRES 100% (SELESAI)" : `PROGRES ${st}%`);
const stageName = st => (st === 0 ? "Kondisi Awal 0%" : st === 100 ? "Progres 100% (Selesai)" : `Progres ${st}%`);
let view = 0;          // tahap yang sedang dibuka di layar Foto
let screen = "foto";   // foto | kegiatan | video | atur
try {
  const v = localStorage.getItem("kka-view");
  if (v === "keg") screen = "kegiatan"; else if (STAGES.includes(+v)) view = +v;
  const sc = localStorage.getItem("kka-screen");
  if (["foto", "kegiatan", "video", "atur"].includes(sc)) screen = sc;
} catch (e) {}
const curStage = () => view;
const KEG_PRESET = ["Rapat persiapan / sosialisasi", "Pembongkaran", "Material datang", "Pekerjaan pondasi",
  "Pekerjaan struktur / kolom", "Pekerjaan dinding", "Pekerjaan atap", "Pekerjaan lantai", "Pekerjaan plafon",
  "Pemasangan pintu & jendela", "Instalasi listrik", "Pengecatan", "Pembersihan", "Serah terima"];
const angleOf = k => ALL_ANGLES.find(a => a.k === k);
const hasRoom = p => p.grup !== "Lingkungan";
function slotsFor(p, st) {
  const s = ANGLES.slice();
  if (hasRoom(p) || photos.has(KEY(p.id, "ruang", st))) s.push(EXTRA);
  if (photos.has(KEY(p.id, "samping", st))) s.push(LEGACY);
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
/* Video: "#vid|<id>" -> {blob, t, dur, title, mime, ext, up, url} (disimpan di IndexedDB yang sama) */
const videos = new Map();
function persistVid(k) {
  const v = videos.get(k); if (!v) return dbPut(k, null);
  dbPut(k, { blob: v.blob, t: v.t, dur: v.dur, title: v.title, mime: v.mime, ext: v.ext, up: v.up, kind: "video" });
}
const REC_FIELDS = ["blob", "orig", "t", "lat", "lng", "acc", "hash", "warn", "cap", "up", "synced", "path", "prevPath"];
function persist(k) {
  const ph = photos.get(k); if (!ph) return dbPut(k, null);
  const rec = {}; REC_FIELDS.forEach(f => (rec[f] = ph[f])); dbPut(k, rec);
}

/* trash: ruang yang dihapus beserta waktu hapusnya. Fotonya TIDAK dihapus sampai "Hapus permanen". */
let trash = [];
try {
  const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  if (s) { paket = s.paket || paket; profil = { ...profil, ...s.profil }; trash = s.trash || []; }
} catch (e) {}
/* Susun ruang: menurut kelompok (Ruang kelas → Ruang administrasi → Lingkungan → Lainnya),
   lalu menurut nama dengan angka alami (Kelas 1, Kelas 2, …, Kelas 10). */
function sortPaket() {
  const gi = g => { const i = GROUPS.indexOf(g); return i < 0 ? GROUPS.length : i; };
  paket.sort((a, b) => gi(a.grup) - gi(b.grup) || a.nama.localeCompare(b.nama, "id", { numeric: true, sensitivity: "base" }));
}
sortPaket();
function saveState() {
  sortPaket();
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ paket, profil, trash })); } catch (e) {}
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
        if (v && v.blob && typeof key === "string" && key.startsWith("#vid|")) videos.set(key, { ...v });
        else if (v && v.blob) photos.set(key, { ...v, t: v.t || Date.now(), url: URL.createObjectURL(v.blob) });
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
function toast(m, actLabel, act) {
  const t = $("toast"); t.textContent = m; t.hidden = false;
  if (actLabel) {
    const b = document.createElement("button"); b.type = "button"; b.className = "toastbtn"; b.textContent = actLabel;
    b.onclick = () => { t.hidden = true; act(); }; t.appendChild(b);
  }
  clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), actLabel ? 8000 : 3200);
}

// ---------- Identitas ----------
const fmap = { pNama: "nama", pNpsn: "npsn", pWil: "wil", pKoor: "koor", pAlamat: "alamat" };
for (const [id, k] of Object.entries(fmap)) {
  $(id).value = profil[k] || "";
  $(id).addEventListener("input", e => { profil[k] = e.target.value; saveState(); if (k === "nama" || k === "npsn") renderHeader(); });
}
$("aGrup").innerHTML = GROUPS.map(g => `<option>${g}</option>`).join("");
$("pGaya").value = profil.gaya || "lengkap";
$("pGaya").addEventListener("change", e => { profil.gaya = e.target.value; saveState(); toast(e.target.value === "lengkap" ? "Cap lengkap: peta, alamat, Lat/Long, waktu." : "Cap ringkas: 3 baris."); });
// Alamat otomatis dari GPS / koordinat sekolah (OpenStreetMap), tetap bisa diubah manual
async function fillAlamat(force) {
  const g = currentGps(); if (!g) { if (force) toast("Lokasi belum ada. Aktifkan GPS atau isi koordinat sekolah."); return; }
  if (!force && profil.alamat) return;
  if (!navigator.onLine) { if (force) toast("Butuh internet untuk mencari alamat."); return; }
  $("pAlamatBtn").disabled = true;
  const a = await KKAGeo.reverse(g.lat, g.lng, force);
  $("pAlamatBtn").disabled = false;
  if (a) { profil.alamat = a; $("pAlamat").value = a; saveState(); if (force) toast("Alamat diisi dari lokasi."); }
  else if (force) toast("Alamat belum ditemukan. Ketik manual, mis. Desa Sarang Burung, Kec. Danau Panggang.");
  KKAGeo.prefetch(g.lat, g.lng);
}
$("pAlamatBtn").addEventListener("click", () => fillAlamat(true));

// ---------- GPS ----------
let fix = null, watchId = null;
const GPS_OPT = { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 };
const HELP_APPROX =
  "HP hanya memberi lokasi perkiraan. Di Android: Pengaturan → Aplikasi → Chrome → Izin → Lokasi → aktifkan \"Gunakan lokasi akurat\". " +
  "Nyalakan juga Lokasi dan \"Akurasi lokasi Google\" di pengaturan Lokasi HP, lalu ketuk Cari ulang di luar ruangan.";
const HELP_DENIED =
  "Izin lokasi ditolak. Android: ketuk ikon gembok di samping alamat situs → Izin → Lokasi → Izinkan. " +
  "iPhone: Pengaturan → Privasi & Keamanan → Layanan Lokasi → Situs Web Safari → Saat Digunakan + Lokasi Akurat; " +
  "lalu Pengaturan → Safari → Lokasi → Izinkan. Setelah itu ketuk Aktifkan GPS.";

function onFix(p) {
  const nf = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), t: Date.now() };
  // Simpan yang lebih akurat; lokasi lama yang akurat tetap dipakai sampai 5 menit
  if (!fix || nf.acc <= fix.acc || Date.now() - fix.t > 300000) fix = nf;
  else fix.t = Date.now();
  renderGps();
}
function onGpsErr(err) {
  if (err.code === 1) {
    setGps("err", "Izin lokasi ditolak."); showHelp(HELP_DENIED);
    try { localStorage.removeItem("kka-gps"); } catch (e) {} // jangan meminta terus bila ditolak
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    $("gpsBtn").hidden = false;
  }
  else if (!fix) setGps("err", "GPS belum dapat sinyal. Coba di luar ruangan.");
  $("gpsRetry").hidden = false;
}
function renderGps() {
  if (!fix) return;
  $("gpsBtn").hidden = true; $("gpsRetry").hidden = false;
  if (fix.acc <= KKA.LIMIT.gpsAcc) {
    setGps("on", `GPS ${fix.lat.toFixed(6)}, ${fix.lng.toFixed(6)} (±${fix.acc} m)`); showHelp("");
    if (window.KKAGeo && navigator.onLine && !renderGps.pre) { renderGps.pre = 1; KKAGeo.prefetch(fix.lat, fix.lng); fillAlamat(false); }
  } else {
    setGps("err", `Akurasi rendah ±${fix.acc} m${schoolKoor() ? " · foto memakai koordinat sekolah" : ""}`);
    showHelp(fix.acc >= 500 ? HELP_APPROX : "Tunggu sebentar di area terbuka, jauh dari atap seng, sampai angkanya di bawah ±50 m.");
  }
}
function showHelp(t) { $("gpsHelp").textContent = t; $("gpsHelp").hidden = !t; }
function startGps() {
  if (!("geolocation" in navigator)) { setGps("err", "HP ini tidak mendukung GPS di browser"); return; }
  if (!window.isSecureContext) { setGps("err", "GPS butuh alamat https://"); return; }
  try { localStorage.setItem("kka-gps", "1"); } catch (e) {} // ingat: GPS menyala otomatis saat aplikasi dibuka lagi
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  setGps("", "Mencari sinyal GPS… (bisa 1–2 menit, sebaiknya di luar ruangan)");
  watchId = navigator.geolocation.watchPosition(onFix, onGpsErr, GPS_OPT);
}
// Minta posisi segar (dipanggil saat kamera dibuka; HP mencari GPS selama operator memotret)
function refreshGps() {
  if (!("geolocation" in navigator)) return;
  if (watchId == null) return startGps(); // kamera dibuka sebelum GPS aktif → nyalakan sekarang
  navigator.geolocation.getCurrentPosition(onFix, () => {}, GPS_OPT);
}
function setGps(cls, text) {
  $("gpsDot").className = "dot " + cls; $("gpsText").textContent = text;
  // Ringkasan di bilah atas
  $("gpsPillDot").className = "dot " + cls;
  $("gpsPillTxt").textContent = fix ? `±${fix.acc} m` : cls === "err" ? "GPS !" : "GPS";
}
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
  else if (k) { toast(`Koordinat sekolah tersimpan: ${k.lat.toFixed(6)}, ${k.lng.toFixed(6)}`); if (window.KKAGeo && navigator.onLine) KKAGeo.prefetch(k.lat, k.lng); }
  renderGps(); render();
});
/* Nyalakan GPS otomatis saat aplikasi dibuka bila:
   - operator pernah menekan "Aktifkan GPS" (diingat di HP ini), atau
   - browser melaporkan izin lokasi sudah diberikan.
   iPhone/Safari sering tidak melaporkan izin, jadi yang pertama yang paling berpengaruh. */
(function autoGps() {
  let remembered = false;
  try { remembered = localStorage.getItem("kka-gps") === "1"; } catch (e) {}
  if (remembered) { startGps(); return; }
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: "geolocation" }).then(s => { if (s.state === "granted") startGps(); }).catch(() => {});
  }
})();

// ---------- Pengaturan tahap ----------
const stageCount = st => [...photos.keys()].filter(k => { const q = parseKey(k); return !q.keg && q.st === st; }).length;
function renderStageEd() {
  $("stgChips").innerHTML = STAGES.map(st => st === 0
    ? `<span class="stg fixed">0% <small>tetap</small></span>`
    : `<span class="stg">${st}%<button type="button" data-stdel="${st}" aria-label="Hapus tahap ${st}%">×</button></span>`).join("");
}
$("stgChips").addEventListener("click", e => {
  const b = e.target.closest("[data-stdel]"); if (!b) return;
  const st = +b.dataset.stdel, n = stageCount(st);
  if (n) { toast(`Tahap ${st}% masih berisi ${n} foto. Hapus atau unduh fotonya dulu.`); return; }
  if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "hapus?"; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "×"; } }, 3000); return; }
  STAGES = STAGES.filter(x => x !== st); saveStages();
  if (view === st) view = 0;
  renderStageEd(); render(); toast(`Tahap ${st}% dihapus.`);
});
$("stgAdd").addEventListener("click", () => {
  const n = Math.round(Number(String($("stgNew").value).replace(",", ".")));
  if (!Number.isFinite(n) || n < 1 || n > 100) { toast("Isi angka persen antara 1 dan 100."); $("stgNew").focus(); return; }
  if (STAGES.includes(n)) { toast(`Tahap ${n}% sudah ada.`); return; }
  STAGES = [...STAGES, n].sort((a, b) => a - b); saveStages();
  $("stgNew").value = ""; renderStageEd(); render(); toast(`Tahap ${n}% ditambahkan.`);
});
$("stgReset").addEventListener("click", () => {
  const keep = STAGES.filter(st => stageCount(st) > 0);
  STAGES = [...new Set([...DEFAULT_STAGES, ...keep])].sort((a, b) => a - b); saveStages();
  renderStageEd(); render(); toast("Tahap dikembalikan ke 0, 25, 50, 75, 100%.");
});

// ---------- Tampilan daftar ----------
const inPaket = k => { const q = parseKey(k); return !q.keg && paket.some(p => p.id === q.pid); };
const kegKeys = () => [...photos.keys()].filter(k => k.startsWith("#keg|")).sort((x, y) => photos.get(y).t - photos.get(x).t);
function stageKeys(st) { return [...photos.keys()].filter(k => { const q = parseKey(k); return !q.keg && q.st === st && inPaket(k); }); }

function renderTabs() {
  const cnt = st => paket.reduce((s, p) => s + ANGLES.filter(a => photos.has(KEY(p.id, a.k, st))).length, 0);
  const total = paket.length * 4;
  $("tabs").classList.toggle("scroll", STAGES.length > 6);
  $("tabs").style.gridTemplateColumns = STAGES.length > 6 ? "" : `repeat(${STAGES.length},minmax(0,1fr))`;
  $("tabs").innerHTML = STAGES.map(st => {
    const n = cnt(st);
    return `<button type="button" role="tab" data-view="${st}" aria-selected="${view === st}" class="tab${view === st ? " on" : ""}${n === total && total ? " full" : ""}">
      <b>${st}%</b><small>${n}/${total}</small></button>`;
  }).join("");
}
$("tabs").addEventListener("click", e => {
  const b = e.target.closest("[data-view]"); if (!b) return;
  view = +b.dataset.view;
  try { localStorage.setItem("kka-view", String(view)); } catch (e) {}
  render(); window.scrollTo({ top: 0, behavior: "smooth" });
});

// ---------- Navigasi layar (menu bawah) ----------
function goScreen(s, focusId) {
  screen = s;
  try { localStorage.setItem("kka-screen", s); } catch (e) {}
  render();
  if (focusId) setTimeout(() => { const el = $(focusId); el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus && el.focus(); }, 60);
  else window.scrollTo({ top: 0 });
}
$("bottomNav").addEventListener("click", e => { const b = e.target.closest("[data-screen]"); if (b) goScreen(b.dataset.screen); });
$("gpsPill").addEventListener("click", () => goScreen("atur", "gpsCard"));
$("abSchool").addEventListener("click", () => goScreen("atur", "pNama"));
function renderHeader() {
  $("abSchool").textContent = profil.nama ? `${profil.nama}${profil.npsn ? " · " + profil.npsn : ""}` : "Isi identitas sekolah di Pengaturan";
  document.querySelectorAll("#bottomNav [data-screen]").forEach(b => b.setAttribute("aria-current", b.dataset.screen === screen ? "page" : "false"));
  const nk = kegKeys().length, nv = videos.size;
  $("bnKeg").hidden = !nk; $("bnKeg").textContent = nk;
  $("bnVid").hidden = !nv; $("bnVid").textContent = nv;
}

function render() {
  const sc = screen;
  $("scrFoto").hidden = sc !== "foto"; $("scrKeg").hidden = sc !== "kegiatan";
  $("scrVid").hidden = sc !== "video"; $("scrSet").hidden = sc !== "atur";
  $("tabs").hidden = sc !== "foto";
  $("sumCard").hidden = !(sc === "foto" || sc === "kegiatan");
  document.body.dataset.screen = sc;
  if (sc === "foto") { renderTabs(); $("eyebrowStage").textContent = stageName(view); renderPaket(view); }
  if (sc === "kegiatan") { $("eyebrowStage").textContent = "Dokumentasi kegiatan"; renderKeg(); }
  if (sc === "video") renderVid();
  renderTrash(); renderHeader();
  renderCloud(); renderFix();
  $("fixBox").hidden = $("fixBox").hidden || sc === "atur";
}

function renderPaket(st) {
  const list = $("list"); list.innerHTML = "";
  let last = null;
  for (const p of paket) {
    if (p.grup !== last) {
      const h = document.createElement("p"); h.className = "group-title"; h.textContent = p.grup;
      list.appendChild(h); last = p.grup;
    }
    const n = ANGLES.filter(a => photos.has(KEY(p.id, a.k, st))).length;
    const slots = slotsFor(p, st);
    const pk = slots.map(a => KEY(p.id, a.k, st)).filter(k => photos.has(k));
    const allUp = pk.length && pk.every(k => photos.get(k).up);
    const el = document.createElement("article");
    el.className = "paket" + (n === 4 ? " done" : "");
    el.innerHTML = `<div class="ph"><h3>${esc(p.nama)}</h3><span class="chip">${n}/4 wajib</span>
      <span class="ph-acts">${pk.length ? `<button class="mini-btn share" data-share="${esc(p.id)}" type="button">${allUp ? "✓ Drive" : "Unggah ke Drive"}</button>` : ""}
      <button class="iconbtn" data-del="${esc(p.id)}" type="button" aria-label="Hapus ruang ${esc(p.nama)} dari daftar">Hapus ruang</button></span></div>
      <div class="slots">${slots.map(a => {
        const k = KEY(p.id, a.k, st), ph = photos.get(k);
        const ref = !ph && st ? photos.get(KEY(p.id, a.k, 0)) : null; // foto 0% sebagai acuan
        return `<div class="slot${a.extra ? " extra" : ""}${a.legacy ? " legacy" : ""}">
          <button class="shot${ph ? " has" : ""}${ref ? " ref" : ""}" type="button" data-shoot="${esc(k)}" aria-label="${ph ? "Lihat" : "Ambil"} foto ${a.l} ${esc(p.nama)}">
            ${ph ? `<img src="${ph.url}" alt="">` : ref ? `<img src="${ref.url}" alt=""><span class="reflbl">acuan 0%</span>` : SVG[a.k]}
            <span class="cam">${ph ? "Lihat" : "Ambil foto"}</span>
            ${ph && window.SB && SB.enabled ? `<span class="sync${ph.synced ? " ok" : ""}">${ph.synced ? "Terkirim" : "Antre"}</span>` : ""}
            ${ph && ph.warn && ph.warn.length ? `<span class="warnb" title="${esc(ph.warn.join(" "))}">${ph.warn.length} catatan</span>` : ""}</button>
          <div class="slab"><span>${a.l}</span>${ph
            ? `<button type="button" data-retake="${esc(k)}">Ulangi</button>`
            : `<button type="button" class="gbtn" data-guide="${esc(k)}">Panduan</button>`}</div>
        </div>`;
      }).join("")}</div>`;
    list.appendChild(el);
  }
  const total = paket.length * 4;
  const cnt = paket.reduce((s, p) => s + ANGLES.filter(a => photos.has(KEY(p.id, a.k, st))).length, 0);
  const anyPhoto = stageKeys(st).length > 0;
  $("tCount").textContent = cnt; $("tOf").hidden = false; $("tTotal").textContent = total; $("tUnit").textContent = `foto wajib ${st}%`;
  $("tBar").style.width = total ? (cnt / total) * 100 + "%" : "0";
  $("zipBtn").disabled = !anyPhoto; $("shareAllBtn").disabled = !anyPhoto;
  const kurang = paket.filter(p => ANGLES.some(a => !photos.has(KEY(p.id, a.k, st)))).length;
  $("dockMsg").textContent = !profil.nama
    ? "Isi dulu nama sekolah dan NPSN, lalu ketuk kotak foto untuk membuka kamera."
    : !anyPhoto ? (st ? `Tahap ${st}%: ketuk kotak foto. Foto 0% tampil samar di kamera sebagai acuan posisi.` : "Ketuk kotak foto untuk membuka kamera. Foto langsung diberi cap identitas.")
    : kurang ? `${stageName(st)}: ${kurang} menu paket belum lengkap 4 foto wajib.`
    : `${stageName(st)} lengkap. Ketuk Unggah ke Drive.`;
}

function renderKeg() {
  const keys = kegKeys();
  $("kegList").innerHTML = keys.length ? keys.map(k => {
    const ph = photos.get(k);
    return `<figure class="kegitem"><button type="button" class="shot has" data-view-k="${esc(k)}" aria-label="Lihat ${esc(ph.cap || "foto kegiatan")}">
      <img src="${ph.url}" alt="">${ph.up ? '<span class="sync ok">✓ Drive</span>' : ""}</button>
      <figcaption><b>${esc(ph.cap || "Kegiatan")}</b><small>${tgl(ph.t)} ${jam(ph.t)}</small></figcaption></figure>`;
  }).join("") : `<p class="hint">Belum ada foto kegiatan. Pilih atau ketik keterangan di atas, lalu ketuk <b>Ambil foto kegiatan</b>.</p>`;
  $("tCount").textContent = keys.length; $("tOf").hidden = true; $("tUnit").textContent = "foto kegiatan";
  $("tBar").style.width = keys.length ? "100%" : "0";
  $("zipBtn").disabled = !keys.length; $("shareAllBtn").disabled = !keys.length;
  $("dockMsg").textContent = keys.length ? `${keys.length} foto kegiatan. Ketuk Unggah ke Drive untuk mengirim semuanya.`
    : "Foto kegiatan: rapat, pekerjaan berlangsung, material datang, serah terima.";
}
$("kegCapList").innerHTML = KEG_PRESET.map(t => `<option value="${esc(t)}">`).join("");
$("kegShoot").addEventListener("click", () => {
  const cap = $("kegCap").value.trim();
  if (!cap) { toast("Isi keterangan kegiatan dulu, mis. \"Pekerjaan atap\"."); $("kegCap").focus(); return; }
  openCamera("#keg|" + Date.now().toString(36), cap);
});
$("kegList").addEventListener("click", e => { const b = e.target.closest("[data-view-k]"); if (b) openViewer(b.dataset.viewK); });

// ---------- Aksi pada daftar ----------
let target = null;
/* Buka kamera: kamera langsung dengan arahan (bila didukung & diaktifkan), selain itu kamera bawaan HP */
let liveOn = true;
try { liveOn = localStorage.getItem("kka-live") !== "0"; } catch (e) {}
let liveFailed = false; // kamera langsung gagal dibuka di sesi ini → pakai kamera bawaan
function openPicker(k) { target = k; $("picker").value = ""; $("picker").click(); }
let pendingCap = ""; // keterangan foto kegiatan yang sedang diambil
function openCamera(k, cap) {
  target = k; refreshGps();
  const q = parseKey(k);
  if (q.keg) pendingCap = cap != null ? cap : (photos.get(k) || {}).cap || pendingCap;
  if (!liveOn || liveFailed || !window.KKACam || !KKACam.supported()) return openPicker(k);
  if (q.keg) {
    return KKACam.open({
      title: `FOTO KEGIATAN — ${pendingCap.toUpperCase()}`, sub: "Landscape dianjurkan. Pastikan kegiatan & lokasinya terlihat jelas.",
      room: true, gps: gpsChip, onShot: f => processFile(f, k, 0),
      onFallback: msg => { if (msg) { liveFailed = true; toast(msg + " Ketuk lagi."); } else openPicker(k); },
    });
  }
  const { pid, ak, st } = q;
  const p = paket.find(x => x.id === pid), a = angleOf(ak);
  const ref = st ? photos.get(KEY(pid, ak, 0)) : null;
  const SUB = {
    serongkanan: "Garis kuning putus-putus = posisi pojok depan kanan bangunan.",
    serongkiri: "Garis kuning putus-putus = posisi pojok depan kiri bangunan.",
    depan: "Seluruh bangunan dan atap masuk bingkai, lurus menghadap fasad.",
    belakang: "Seluruh dinding belakang dan atap masuk bingkai.",
    ruang: "Dari pojok ruangan, arahkan diagonal: lantai, dinding, plafon.",
  };
  KKACam.open({
    title: `${a.l.toUpperCase()} — ${p.nama.toUpperCase()} · ${st}%`,
    sub: ref ? "Foto 0% tampil samar: samakan posisi bangunan dengan foto itu." : (SUB[a.k] || ""),
    corner: !ref && (a.k === "serongkanan" || a.k === "serongkiri"),
    room: a.k === "ruang",
    ghost: ref ? URL.createObjectURL(ref.orig || ref.blob) : null,
    gps: gpsChip,
    onShot: f => processFile(f, k, 0),
    onFallback: msg => {
      if (msg) { liveFailed = true; toast(msg + " Ketuk kotak foto lagi."); }
      else openPicker(k);
    },
  });
}

function gpsChip() {
  const g = currentGps();
  if (!g) return { ok: false, label: "GPS mati" };
  if (g.src === "sekolah") return { ok: true, label: "Koord. sekolah" };
  return { ok: g.acc <= KKA.LIMIT.gpsAcc, label: `GPS ±${g.acc} m` };
}

// Panduan posisi
let guideOn = true;
try { guideOn = localStorage.getItem("kka-guide") !== "0"; } catch (e) {}
$("optGuide").checked = guideOn;
$("optLive").checked = liveOn;
$("optLive").addEventListener("change", e => {
  liveOn = e.target.checked; liveFailed = false;
  try { localStorage.setItem("kka-live", liveOn ? "1" : "0"); } catch (e) {}
});
$("optGuide").addEventListener("change", e => {
  guideOn = e.target.checked;
  try { localStorage.setItem("kka-guide", guideOn ? "1" : "0"); } catch (e) {}
});
let guideKey = null;
function showGuide(k, withCamera) {
  const { pid, ak } = parseKey(k);
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
function openShoot(k) { guideOn && !parseKey(k).keg ? showGuide(k, true) : openCamera(k); }
$("gGo").addEventListener("click", () => { $("guide").hidden = true; openCamera(guideKey); });
$("gCancel").addEventListener("click", () => ($("guide").hidden = true));

$("list").addEventListener("click", e => {
  const r = e.target.closest("[data-retake]"), s = e.target.closest("[data-shoot]"), d = e.target.closest("[data-del]"),
    g = e.target.closest("[data-guide]"), sh = e.target.closest("[data-share]");
  if (sh) { const p = paket.find(x => x.id === sh.dataset.share); return shareKeys(slotsFor(p, view).map(a => KEY(p.id, a.k, view)).filter(k => photos.has(k)), `${p.nama} · ${stageName(view)}`); }
  if (g) return showGuide(g.dataset.guide, false);
  if (r) return openShoot(r.dataset.retake);
  if (s) { photos.has(s.dataset.shoot) ? openViewer(s.dataset.shoot) : openShoot(s.dataset.shoot); return; }
  if (d) {
    const id = d.dataset.del, n = paketPhotoKeys(id).length;
    if (d.dataset.armed) { trashPaket(id); }
    else {
      d.dataset.armed = 1;
      d.textContent = n ? `Hapus ruang + ${n} foto?` : "Yakin hapus ruang?";
      setTimeout(() => { if (d.isConnected) { delete d.dataset.armed; d.textContent = "Hapus ruang"; } }, 4000);
    }
  }
});

// ---------- Hapus ruang → tempat sampah (bisa dipulihkan) ----------
const paketPhotoKeys = id => [...photos.keys()].filter(k => { const q = parseKey(k); return !q.keg && q.pid === id; });
function trashPaket(id) {
  const i = paket.findIndex(p => p.id === id); if (i < 0) return;
  const [p] = paket.splice(i, 1);
  trash = trash.filter(t => t.id !== id); trash.unshift({ ...p, del: Date.now() });
  saveState(); render();
  toast(`${p.nama} dipindah ke "Ruang yang dihapus". Foto masih aman.`, "Urungkan", () => restorePaket(id));
}
function placePaket(item) {
  const idx = paket.map(p => p.grup).lastIndexOf(item.grup);
  idx < 0 ? paket.push(item) : paket.splice(idx + 1, 0, item);
}
function restorePaket(id) {
  const t = trash.find(x => x.id === id); if (!t) return;
  trash = trash.filter(x => x.id !== id);
  const { del, ...item } = t;
  // kembalikan ke urutan aslinya bila ruang bawaan
  const di = DEFAULT_PAKET.findIndex(p => p.id === id);
  if (di >= 0) {
    const after = DEFAULT_PAKET.slice(0, di).map(p => p.id).reverse().find(pid => paket.some(p => p.id === pid));
    const pos = after ? paket.findIndex(p => p.id === after) + 1 : 0;
    paket.splice(pos, 0, item);
  } else placePaket(item);
  saveState(); render(); toast(`${item.nama} dipulihkan beserta ${paketPhotoKeys(id).length} foto.`);
}
function purgePaket(id) {
  paketPhotoKeys(id).forEach(k => { const ph = photos.get(k); if (ph && ph.url) URL.revokeObjectURL(ph.url); photos.delete(k); dbPut(k, null); });
  trash = trash.filter(x => x.id !== id); saveState(); render(); toast("Ruang dan fotonya dihapus permanen.");
}
function renderTrash() {
  $("trashBox").hidden = !trash.length;
  $("trashList").innerHTML = trash.map(t => {
    const n = paketPhotoKeys(t.id).length;
    return `<li><span><b>${esc(t.nama)}</b> <small>${n} foto · dihapus ${tgl(t.del)} ${jam(t.del)}</small></span>
      <span class="acts"><button class="btn primary" type="button" data-restore="${esc(t.id)}">Pulihkan</button>
      <button class="btn ghost" type="button" data-purge="${esc(t.id)}">Hapus permanen</button></span></li>`;
  }).join("");
  const missing = DEFAULT_PAKET.filter(d => !paket.some(p => p.id === d.id));
  $("defBtn").hidden = !missing.length;
  $("defBtn").textContent = `Kembalikan ruang bawaan (${missing.map(m => m.nama).join(", ")})`;
}
$("trashList").addEventListener("click", e => {
  const r = e.target.closest("[data-restore]"), pg = e.target.closest("[data-purge]");
  if (r) restorePaket(r.dataset.restore);
  if (pg) {
    if (!pg.dataset.armed) { pg.dataset.armed = 1; pg.textContent = "Yakin? Foto ikut hilang"; setTimeout(() => { if (pg.isConnected) { delete pg.dataset.armed; pg.textContent = "Hapus permanen"; } }, 4000); return; }
    purgePaket(pg.dataset.purge);
  }
});
$("defBtn").addEventListener("click", () => {
  const missing = DEFAULT_PAKET.filter(d => !paket.some(p => p.id === d.id));
  missing.forEach(m => { if (trash.some(t => t.id === m.id)) restorePaket(m.id); });
  DEFAULT_PAKET.filter(d => !paket.some(p => p.id === d.id)).forEach(m => {
    const di = DEFAULT_PAKET.indexOf(m);
    const after = DEFAULT_PAKET.slice(0, di).map(p => p.id).reverse().find(pid => paket.some(p => p.id === pid));
    paket.splice(after ? paket.findIndex(p => p.id === after) + 1 : 0, 0, { ...m });
  });
  saveState(); render(); toast(`${missing.map(m => m.nama).join(", ")} ditambahkan kembali.`);
});
$("aBtn").addEventListener("click", () => {
  const nm = $("aNama").value.trim();
  if (!nm) { $("aNama").focus(); return; }
  const grup = $("aGrup").value;
  let id = nm.toLowerCase().replace(/[^a-z0-9]+/g, "") || "paket";
  const inTrash = trash.find(t => t.id === id);
  if (inTrash) { $("aNama").value = ""; restorePaket(id); return; } // nama sama dengan ruang yang dihapus → pulihkan
  while (paket.some(p => p.id === id) || trash.some(t => t.id === id)) id += "x";
  placePaket({ id, nama: nm, grup });
  $("aNama").value = ""; saveState(); render(); toast("Ruang " + nm + " ditambahkan");
});

// ---------- Video ----------
const fmtDur = s => `${Math.floor(s / 60)}:${two(Math.round(s % 60))}`;
const idLine = () => [profil.nama || "-", "NPSN " + (profil.npsn || "-"), profil.wil].filter(Boolean).join("  ·  ");
const vidName = (k) => { const v = videos.get(k); return `${tgl(v.t)} ${jam(v.t)} - Video - ${clean(v.title || "Dokumentasi")}.${v.ext || "mp4"}`; };

let vidAudio = true;
try { vidAudio = localStorage.getItem("kka-vaudio") !== "0"; } catch (e) {}
$("vidAudio").checked = vidAudio;
$("vidAudio").addEventListener("change", e => { vidAudio = e.target.checked; try { localStorage.setItem("kka-vaudio", vidAudio ? "1" : "0"); } catch (e) {} });

function saveVideo(v) {
  const k = "#vid|" + Date.now().toString(36);
  videos.set(k, v); persistVid(k); render();
  toast(`Video tersimpan (${fmtDur(v.dur || 0)}, ${(v.blob.size / 1048576).toFixed(1)} MB).`);
}
function renderVid() {
  $("vidTitleList").innerHTML = [...STAGES.map(st => `Keliling bangunan – ${stageName(st).toLowerCase()}`), "Kegiatan pekerjaan berlangsung", "Serah terima"]
    .map(t => `<option value="${esc(t)}">`).join("");
  const keys = [...videos.keys()].sort((a, b) => videos.get(b).t - videos.get(a).t);
  $("vidList").innerHTML = keys.length ? "" : `<p class="hint empty">Belum ada video. Rekam di lokasi atau buat video laporan dari foto.</p>`;
  $("vidList").innerHTML += keys.map(k => {
    const v = videos.get(k);
    if (!v.url) v.url = URL.createObjectURL(v.blob);
    return `<div class="viditem"><video src="${v.url}" controls playsinline preload="metadata"></video>
      <div class="meta"><b>${esc(v.title || "Video")}</b><small>${tgl(v.t)} ${jam(v.t)} · ${fmtDur(v.dur || 0)} · ${(v.blob.size / 1048576).toFixed(1)} MB</small>${v.up ? '<small class="okc">✓ Drive</small>' : ""}</div>
      <div class="acts"><button class="btn primary" type="button" data-vshare="${esc(k)}">Unggah ke Drive</button>
      <button class="btn" type="button" data-vdl="${esc(k)}">Unduh</button>
      <button class="btn ghost" type="button" data-vdel="${esc(k)}">Hapus</button></div></div>`;
  }).join("");
  // Pilihan isi video laporan
  const sel = $("mkScope"), prev = sel.value;
  const opts = [["cmp", "Perbandingan semua tahap per ruang (0% → 100%)"], ...STAGES.map(st => [String(st), `Hanya foto ${stageName(st)}`]), ["keg", "Foto kegiatan"]];
  sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
  if (prev) sel.value = prev;
  updateEstimate();
}
$("vidList").addEventListener("click", e => {
  const sh = e.target.closest("[data-vshare]"), dl = e.target.closest("[data-vdl]"), del = e.target.closest("[data-vdel]");
  if (sh) {
    const k = sh.dataset.vshare, v = videos.get(k);
    const f = new File([v.blob], vidName(k), { type: v.mime || v.blob.type, lastModified: v.t });
    if (!navigator.canShare || !navigator.canShare({ files: [f] })) return toast("HP/browser ini belum mendukung kirim langsung. Ketuk Unduh, lalu unggah lewat aplikasi Drive.");
    navigator.share({ files: [f], title: v.title }).then(() => { v.up = Date.now(); persistVid(k); render(); toast("Video dibagikan. Periksa di Google Drive."); })
      .catch(er => { if (er && er.name !== "AbortError") toast("Gagal membuka menu Bagikan: " + er.message); });
  }
  if (dl) { const k = dl.dataset.vdl; download(vidName(k), videos.get(k).blob); }
  if (del) {
    if (!del.dataset.armed) { del.dataset.armed = 1; del.textContent = "Yakin hapus?"; setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = "Hapus"; } }, 3000); return; }
    const k = del.dataset.vdel, v = videos.get(k); if (v && v.url) URL.revokeObjectURL(v.url);
    videos.delete(k); dbPut(k, null); render(); toast("Video dihapus.");
  }
});

// Rekam video di lokasi
$("vidRec").addEventListener("click", () => {
  const title = $("vidTitle").value.trim() || `Keliling bangunan – ${stageName(0).toLowerCase()}`;
  if (!profil.nama) { toast("Isi nama sekolah dan NPSN dulu."); return; }
  refreshGps();
  KKAVid.openRecorder({
    title, audio: vidAudio, idLine: idLine(), zone: zoneLabel, gps: currentGps, tag: "VIDEO DOKUMENTASI",
    onSaved: v => saveVideo({ ...v, title }),
    onError: m => toast(m),
    onUnsupported: () => { toast("Perekam di aplikasi tidak didukung HP ini. Memakai kamera video bawaan (tanpa cap)."); $("vidPicker").dataset.title = title; $("vidPicker").value = ""; $("vidPicker").click(); },
  });
});
$("vidPicker").addEventListener("change", e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const v = document.createElement("video"); v.preload = "metadata"; v.src = URL.createObjectURL(f);
  v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); saveVideo({ blob: f, mime: f.type, ext: (f.name.split(".").pop() || "mp4").toLowerCase(), dur: v.duration || 0, t: takenTime(f), title: e.target.dataset.title || "Video" }); };
  v.onerror = () => saveVideo({ blob: f, mime: f.type, ext: "mp4", dur: 0, t: takenTime(f), title: e.target.dataset.title || "Video" });
});

// Video laporan otomatis dari foto
function reportScenes(scope, sec) {
  const sc = [];
  const school = profil.nama || "Sekolah";
  const head = (kicker, title, lines, d = 3) => sc.push({ type: "title", kicker, title, lines, sec: d });
  const badgeColor = st => (st === 0 ? "#f0a050" : st === 100 ? "#4cc27e" : "#f2b705");
  if (scope === "keg") {
    head("DOKUMENTASI KEGIATAN · REVITALISASI SD 2026", school, [idLine().replace(school + "  ·  ", ""), `${kegKeys().length} foto kegiatan`]);
    kegKeys().slice().reverse().forEach(k => { const ph = photos.get(k); sc.push({ type: "photo", blob: ph.blob, badge: "KEGIATAN", label: `${ph.cap || ""} · ${tgl(ph.t)}`, sec }); });
  } else {
    const stages = scope === "cmp" ? STAGES : [+scope];
    head("DOKUMENTASI REVITALISASI SD 2026", school, [idLine().replace(school + "  ·  ", ""),
      scope === "cmp" ? "Perbandingan kondisi per ruang: 0% → 100%" : stageName(+scope)]);
    for (const p of paket) {
      const rows = [];
      for (const a of ALL_ANGLES) {
        const shots = stages.map(st => [st, photos.get(KEY(p.id, a.k, st))]).filter(([, ph]) => ph);
        if (shots.length) rows.push([a, shots]);
      }
      if (!rows.length) continue;
      const used = [...new Set(rows.flatMap(([, sh]) => sh.map(([st]) => st + "%")))];
      head(p.grup.toUpperCase(), p.nama, [`Tahap: ${used.join(" → ")}`], 2);
      for (const [a, shots] of rows) for (const [st, ph] of shots)
        sc.push({ type: "photo", blob: ph.blob, badge: st === 0 ? "0% · KONDISI AWAL" : st === 100 ? "100% · SELESAI" : `PROGRES ${st}%`, badgeColor: badgeColor(st), label: `${p.nama} · ${a.l}`, sec });
    }
  }
  head("REVITALISASI SD 2026", school, ["Video dibuat " + new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })], 3);
  return sc;
}
function updateEstimate() {
  const sc = reportScenes($("mkScope").value || "cmp", +$("mkSec").value);
  const n = sc.filter(s => s.type === "photo").length, dur = sc.reduce((a, s) => a + s.sec, 0);
  $("mkEst").textContent = n ? `${n} foto · durasi video ±${fmtDur(dur)}. Pembuatan butuh waktu sama dengan durasinya; biarkan layar menyala.`
    : "Belum ada foto untuk pilihan ini.";
  $("mkBtn").disabled = !n;
}
$("mkScope").addEventListener("change", updateEstimate);
$("mkSec").addEventListener("change", updateEstimate);
$("mkBtn").addEventListener("click", () => {
  const scope = $("mkScope").value, sc = reportScenes(scope, +$("mkSec").value);
  const label = scope === "cmp" ? "Video laporan – perbandingan 0% → 100%" : scope === "keg" ? "Video laporan – kegiatan" : `Video laporan – ${stageName(+scope).toLowerCase()}`;
  KKAVid.makeReport(sc, { onSaved: v => saveVideo({ ...v, title: label }), onError: m => toast(m) });
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
  const when0 = new Date(takenAt);
  if ((profil.gaya || "lengkap") === "lengkap" && gps && window.KKAGeo) {
    await stampFull(x, W, H, when0, gps, p, a, opts);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    const res = { blob, t: when0.getTime(), lat: gps.lat, lng: gps.lng, acc: gps.acc };
    if (orig) res.orig = orig;
    return res;
  }

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
  const title = opts.title || `${a.l.toUpperCase()} — ${p.nama.toUpperCase()}`;
  x.fillText(title, left, y, maxW);
  const tag = (opts.tag || "KONDISI AWAL 0%") + " · REVITALISASI SD 2026";
  x.font = `700 ${Math.round(bFs * 0.8)}px Arial, sans-serif`;
  const titleW = (x.font = `800 ${tFs}px Arial, sans-serif`, x.measureText(title).width);
  x.font = `700 ${Math.round(bFs * 0.8)}px Arial, sans-serif`;
  const tagW = x.measureText(tag).width;
  const tagOnTitle = left + titleW + 30 * u + tagW <= W - pad;
  if (tagOnTitle) { x.fillStyle = "rgba(255,255,255,.85)"; x.textAlign = "right"; x.fillText(tag, W - pad, y); x.textAlign = "left"; }
  else lines[0] += "  ·  " + (opts.tag || "KONDISI AWAL 0%");
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

// Judul & label cap untuk sebuah kunci foto
function stampCtx(k, cap) {
  const q = parseKey(k);
  if (q.keg) return { p: { nama: cap || "Kegiatan" }, a: { l: "Kegiatan", k: "keg" }, opts: { title: `KEGIATAN — ${(cap || "").toUpperCase()}`, tag: "DOKUMENTASI KEGIATAN" } };
  return { p: paket.find(x => x.id === q.pid), a: angleOf(q.ak), opts: { tag: stageTag(q.st) } };
}

/* Cap LENGKAP: peta mini + alamat + Lat/Long + Plus Code + waktu + identitas sekolah.
   Tinggi ±20% foto; ukuran mengikuti sisi terpendek foto. */
function wrapText(x, text, maxW, maxLines) {
  const words = String(text).split(/\s+/), out = []; let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (x.measureText(t).width <= maxW || !cur) cur = t; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] += "…"; }
  return out;
}
async function addressFor(gps) {
  if (profil.alamat && profil.alamat.trim()) return { text: profil.alamat.trim(), exact: true };
  const found = await Promise.race([KKAGeo.reverse(gps.lat, gps.lng), new Promise(r => setTimeout(() => r(null), 3500))]);
  return found ? { text: found, exact: true } : { text: profil.wil || "", exact: false };
}
async function stampFull(x, W, H, when, gps, p, a, opts) {
  const u = Math.min(W, H) / 720;
  const pad = Math.round(12 * u), tFs = Math.round(23 * u), bFs = Math.round(16 * u), lh = Math.round(bFs * 1.38);
  const ad = await addressFor(gps), addr = ad.text;
  const pc = KKAGeo.plusCode(gps.lat, gps.lng);
  const desa = ad.exact ? (addr.split(",")[0] || "").trim() : "";
  const hari = when.toLocaleDateString("id-ID", { weekday: "long" });
  const tglTxt = `${hari}, ${two(when.getDate())}/${two(when.getMonth() + 1)}/${when.getFullYear()} ${two(when.getHours())}:${two(when.getMinutes())} ${zoneLabel(when)}`;
  const coord = `Lat ${gps.lat.toFixed(6)}°  Long ${gps.lng.toFixed(6)}°` + (gps.src === "sekolah" ? "  (koordinat sekolah)" : gps.acc != null ? `  (±${gps.acc} m)` : "");
  const title = opts.title || `${a.l.toUpperCase()} — ${p.nama.toUpperCase()}`;
  const tag = (opts.tag || "KONDISI AWAL 0%");
  // Ukur dulu: peta di kiri setinggi blok teks
  x.font = `500 ${bFs}px Arial, sans-serif`;
  const estMapS = Math.round(tFs * 1.2 + lh * 5);
  const left = pad * 2 + estMapS + Math.round(14 * u), maxW = W - left - pad * 2;
  const addrLines = wrapText(x, addr || "-", maxW, 2);
  const body = [...addrLines, `${coord}  ·  ${KKAGeo.shortCode(pc)}${desa ? " " + desa : ""}`, tglTxt,
    `${profil.nama || "-"} · NPSN ${profil.npsn || "-"} · ${tag} · Revitalisasi SD 2026`];
  const blockH = Math.round(tFs * 1.2) + lh * body.length;
  const mapS = blockH;
  const bandH = blockH + pad * 2, top = H - bandH - pad;
  // Latar: kotak gelap transparan berujung bulat
  const bx = pad, bw = W - pad * 2, r = 10 * u;
  x.save();
  x.fillStyle = opts.cover ? "rgb(18,20,19)" : "rgba(10,12,11,.76)";
  if (opts.cover) x.fillRect(0, top - pad, W, H - top + pad);
  x.beginPath(); x.moveTo(bx + r, top); x.arcTo(bx + bw, top, bx + bw, top + bandH, r); x.arcTo(bx + bw, top + bandH, bx, top + bandH, r);
  x.arcTo(bx, top + bandH, bx, top, r); x.arcTo(bx, top, bx + bw, top, r); x.closePath(); x.fill();
  x.restore();
  await KKAGeo.drawMap(x, bx + pad, top + pad, mapS, gps.lat, gps.lng);
  const tx = bx + pad + mapS + Math.round(14 * u), tw = bx + bw - pad - tx;
  x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = 2 * u; x.textAlign = "left";
  let y = top + pad + tFs;
  x.font = `800 ${tFs}px Arial, sans-serif`; x.fillStyle = "#f2b705";
  x.fillText(title, tx, y, tw);
  y += Math.round(tFs * 0.2);
  x.font = `500 ${bFs}px Arial, sans-serif`;
  body.forEach((l, i) => { y += lh; x.fillStyle = i < addrLines.length ? "#ffffff" : "rgba(255,255,255,.88)"; x.fillText(l, tx, y - lh * 0.22, tw); });
  x.shadowBlur = 0;
}

// ---------- Cetak ulang cap untuk foto tanpa koordinat ----------
const noKoorKeys = () => [...photos.entries()]
  .filter(([k, ph]) => ph.lat == null && (k.startsWith("#keg|") || inPaket(k))).map(([k]) => k);
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
$("fixFill").addEventListener("click", () => goScreen("atur", "pKoor"));
// Tombol cetak langsung aktif begitu koordinat valid diketik (tanpa harus keluar dari kolom)
$("pKoor").addEventListener("input", () => renderFix());
$("fixBtn").addEventListener("click", async () => {
  const sk = schoolKoor(); if (!sk) return;
  const keys = noKoorKeys(); let ok = 0;
  $("fixBtn").disabled = true;
  for (const k of keys) {
    const ph = photos.get(k);
    const c = stampCtx(k, ph.cap);
    try {
      const src = ph.orig || ph.blob;
      const img = await createImageBitmap(src);
      const res = await stamp(img, ph.t, { ...sk, acc: null, src: "sekolah" }, c.p, c.a, { ...c.opts, cover: !ph.orig });
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
  const q = parseKey(k);
  if (q.keg) return "Kegiatan " + ((photos.get(k) || {}).cap || pendingCap || "");
  const p = paket.find(x => x.id === q.pid), a = angleOf(q.ak);
  return p && a ? `${a.l} ${p.nama}${q.st ? " " + q.st + "%" : ""}` : k;
};
$("picker").addEventListener("change", e => {
  const f = e.target.files && e.target.files[0];
  if (f && target) processFile(f, target, 0);
});
// Putar gambar searah jarum jam (derajat kelipatan 90)
function rotated(img, deg) {
  if (!deg) return img;
  const c = document.createElement("canvas"), swap = deg % 180 !== 0;
  c.width = swap ? img.height : img.width; c.height = swap ? img.width : img.height;
  const x = c.getContext("2d");
  x.translate(c.width / 2, c.height / 2); x.rotate(deg * Math.PI / 180);
  x.drawImage(img, -img.width / 2, -img.height / 2);
  return c;
}
async function processFile(f, key, turn) {
  const q = parseKey(key);
  const cap = q.keg ? pendingCap : "";
  const c = stampCtx(key, cap);
  const p = c.p, a = c.a;
  try {
    toast("Memeriksa foto…");
    const img = rotated(await loadImage(f), turn);
    const info = KKA.analyze(img);
    const takenAt = takenTime(f);
    const gps = currentGps();
    // Foto kembar diperiksa dalam paket yang sama (beberapa ruang kelas bisa berada di gedung yang sama)
    // Foto kembar: dibandingkan dengan foto lain di paket & tahap yang sama (foto kegiatan: sesama kegiatan)
    const others = [...photos.entries()]
      .filter(([k]) => { if (k === key) return false; const o = parseKey(k); return q.keg ? o.keg : !o.keg && o.pid === q.pid && o.st === q.st; })
      .map(([k, ph]) => ({ label: labelOf(k), hash: ph.hash, lat: ph.lat, lng: ph.lng }));
    const checks = KKA.runChecks({ info, takenAt, gps, others, allowPortrait: q.keg });
    const res = await stamp(img, takenAt, gps, p, a, c.opts);
    const warn = checks.filter(c => !c.ok).map(c => c.text);
    if (pending) URL.revokeObjectURL(pending.url);
    pending = { key, rec: { ...res, hash: info.hash, warn, cap: cap || undefined }, url: URL.createObjectURL(res.blob), raw: f, turn };
    showReview(p, a, checks);
  } catch (err) {
    toast("Foto tidak bisa dibaca. Coba ambil ulang atau pilih format JPG/PNG.");
  }
}
// Bila foto terlanjur menyamping, putar 90° lalu periksa ulang
$("rRotate").addEventListener("click", () => {
  if (!pending) return;
  const { raw, key, turn } = pending;
  URL.revokeObjectURL(pending.url); pending = null;
  processFile(raw, key, ((turn || 0) + 90) % 360);
});
function showReview(p, a, checks) {
  const nWarn = checks.filter(c => !c.ok).length;
  const blocked = checks.some(c => c.block);
  pending.blocked = blocked;
  const q = parseKey(pending.key);
  $("rTitle").textContent = q.keg ? `Kegiatan — ${p.nama}` : `${a.l} — ${p.nama}${q.st ? " · " + q.st + "%" : ""}`;
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
  photos.set(key, { ...rec, up: undefined, synced: false, path: null, prevPath, url });
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
  const q = parseKey(k), ph = photos.get(k);
  if (q.keg) return `${tgl(ph.t)} ${jam(ph.t)} - Kegiatan - ${clean(ph.cap || "Kegiatan")}.jpg`;
  const p = paket.find(x => x.id === q.pid), a = angleOf(q.ak);
  return `${tgl(ph.t)} ${jam(ph.t)} - ${clean(p.nama)} - ${a.l}${q.st ? " - " + q.st + "%" : ""}.jpg`;
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
$("vShare").onclick = () => shareKeys([vKey], labelOf(vKey));
$("vDel").onclick = () => {
  const b = $("vDel");
  if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Yakin hapus?"; setTimeout(() => { delete b.dataset.armed; b.textContent = "Hapus"; }, 3000); return; }
  delete b.dataset.armed; b.textContent = "Hapus";
  const ph = photos.get(vKey); if (ph) URL.revokeObjectURL(ph.url);
  photos.delete(vKey); dbPut(vKey, null); $("viewer").hidden = true; render(); toast("Foto dihapus.");
};

/* ZIP: Foto Kondisi Awal - <Sekolah>/<Nama paket>/<tanggal jam - paket - sudut>.jpg */
function viewKeys() {
  if (screen === "kegiatan") return kegKeys();
  const out = [];
  for (const p of paket) for (const a of ALL_ANGLES) { const k = KEY(p.id, a.k, view); if (photos.has(k)) out.push(k); }
  return out;
}
$("zipBtn").onclick = async () => {
  const rootName = screen === "kegiatan" ? `Foto Kegiatan - ${clean(profil.nama || "Sekolah")}`
    : view === 0 ? `Foto Kondisi Awal - ${clean(profil.nama || "Sekolah")}` : `Foto Progres ${view}% - ${clean(profil.nama || "Sekolah")}`;
  const entries = []; let first = Infinity;
  for (const k of viewKeys()) {
    const ph = photos.get(k), q = parseKey(k);
    first = Math.min(first, ph.t);
    const sub = q.keg ? "" : clean(paket.find(x => x.id === q.pid).nama) + "/";
    entries.push({ path: `${rootName}/${sub}${fname(k)}`, blob: ph.blob, date: new Date(ph.t) });
  }
  toast("Menyusun ZIP…");
  const blob = await window.makeZip(entries);
  download(`${rootName} - ${tgl(first)}.zip`, blob);
};

// ---------- Unggah ke Drive (menu Bagikan bawaan HP) ----------
/* Membuka menu Bagikan iPhone/Android berisi foto-foto ini. Pilih "Drive", lalu pilih folder tujuan.
   Tidak menyimpan ke galeri. Foto yang sudah dibagikan ditandai "✓ Drive". */
function shareKeys(keys, title) {
  if (!keys.length) return toast("Belum ada foto untuk diunggah.");
  const files = keys.map(k => { const ph = photos.get(k); return new File([ph.blob], fname(k), { type: "image/jpeg", lastModified: ph.t }); });
  if (!navigator.canShare || !navigator.canShare({ files })) {
    return toast("HP/browser ini belum mendukung kirim langsung. Pakai Unduh (.zip), lalu unggah lewat aplikasi Drive.");
  }
  navigator.share({ files, title }).then(() => {
    const now = Date.now();
    keys.forEach(k => { const ph = photos.get(k); if (ph) { ph.up = now; persist(k); } });
    render(); toast(`${keys.length} foto dibagikan. Periksa di Google Drive.`);
  }).catch(e => { if (e && e.name !== "AbortError") toast("Gagal membuka menu Bagikan: " + e.message); });
}
$("shareAllBtn").onclick = () => shareKeys(viewKeys(), screen === "kegiatan" ? "Foto kegiatan" : stageName(view));

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
    const q = parseKey(k); if (q.keg) continue;
    const p = paket.find(x => x.id === q.pid), a = angleOf(q.ak);
    if (!p || !a) continue;
    const path = `${schoolFolder()}/${q.st}%/${clean(p.nama)}/${fname(k)}`;
    try {
      await SB.upload(path, ph.blob);
      await SB.upsertRow({
        npsn: profil.npsn, nama_sekolah: profil.nama, wilayah: profil.wil || null,
        paket: p.nama, sudut: q.st ? `${a.l} (${q.st}%)` : a.l, diambil_pada: new Date(ph.t).toISOString(),
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
renderStageEd(); render(); renderCloud();
openDb().then(async d => {
  idb = d; await dbLoad();
  // Tahap yang masih punya foto tidak boleh hilang dari daftar
  const used = [...photos.keys()].map(parseKey).filter(q => !q.keg).map(q => q.st);
  const merged = [...new Set([...STAGES, ...used])].sort((a, b) => a - b);
  if (merged.length !== STAGES.length) { STAGES = merged; saveStages(); }
  renderStageEd(); render(); renderCloud(); syncAll();
});

/* Kamera Foto Kondisi Awal — Revitalisasi SD 2026
   Semua data (identitas, daftar paket, foto) disimpan di HP itu sendiri:
   identitas & paket di localStorage, foto di IndexedDB. */

const APP_VERSION = "2.22.0 · 26 Nov 2026";

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
/* Tahap progres (di atas 0%): 4 foto wajib Depan · Samping · Belakang · Dalam ruangan.
   (Ruang tanpa bangunan, mis. Penataan lingkungan: tanpa foto dalam.) 0% tetap mengikuti form resmi di atas. */
const PROG_ANGLES = [
  { k: "depan",    l: "Tampak Depan",    d: "Lurus menghadap fasad" },
  { k: "samping",  l: "Tampak Samping",  d: "Dinding samping dari ujung ke ujung" },
  { k: "belakang", l: "Tampak Belakang", d: "Sisi belakang bangunan" },
  { k: "ruang",    l: "Dalam Ruangan",   d: "Lantai, dinding, plafon" },
];
// Foto wajib sebuah ruang pada tahap tertentu
function reqAngles(p, st) {
  if (!st) return ANGLES;
  return hasRoom(p) ? PROG_ANGLES : PROG_ANGLES.filter(a => a.k !== "ruang");
}
const reqCount = (p, st) => reqAngles(p, st).filter(a => photos.has(KEY(p.id, a.k, st))).length;

/* Tahap dokumentasi. Kunci foto:
   0%      → "paket|sudut"            (sama seperti versi lama, foto lama tetap terbaca)
   25–100% → "@50|paket|sudut"
   Kegiatan→ "#keg|<id>"               */
/* Tahap bisa diatur sendiri oleh operator (0% selalu ada). Disimpan di HP. */
const DEFAULT_STAGES = [0, 25, 50, 75, 100];
let STAGES = DEFAULT_STAGES.slice();
try {
  const st = JSON.parse(localStorage.getItem("kka-stages") || "null");
  if (Array.isArray(st) && st.length) STAGES = [...new Set([0, ...st.map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 100)])].sort((a, b) => a - b);
} catch (e) {}
function saveStages() { try { localStorage.setItem("kka-stages", JSON.stringify(STAGES)); } catch (e) {} }
const KEY = (pid, ak, st) => (st ? `@${st}|${pid}|${ak}` : `${pid}|${ak}`);
function parseKey(k) {
  if (k.startsWith("#keg|")) return { keg: true, id: k.slice(5), st: null };
  if (k.startsWith("@")) { const [s, pid, ak] = k.split("|"); return { st: +s.slice(1), pid, ak }; }
  const [pid, ak] = k.split("|"); return { st: 0, pid, ak };
}
// Persen boleh desimal (mis. 3,25). Kunci internal memakai titik ("@3.25|…"), tampilan memakai koma.
const pn = st => String(st).replace(".", ",");
const parsePct = v => { const n = Number(String(v).trim().replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const stageTag = st => (st === 0 ? "KONDISI AWAL 0%" : st === 100 ? "PROGRES 100% (SELESAI)" : `PROGRES ${pn(st)}%`);
const stageName = st => (st === 0 ? "Kondisi Awal 0%" : st === 100 ? "Progres 100% (Selesai)" : `Progres ${pn(st)}%`);
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
const angleOf = (k, st) => (st ? PROG_ANGLES.find(a => a.k === k) : null) || ALL_ANGLES.find(a => a.k === k);
const hasRoom = p => p.grup !== "Lingkungan";
function slotsFor(p, st) {
  if (st) { // progres: 4 wajib + foto lama (serong) yang terlanjur diambil tetap tampil
    const s = reqAngles(p, st).slice();
    for (const k of ["serongkanan", "serongkiri"]) if (photos.has(KEY(p.id, k, st))) s.push({ ...angleOf(k), l: angleOf(k).l + " (lama)", extra: true, legacy: true });
    if (!hasRoom(p) && photos.has(KEY(p.id, "ruang", st))) s.push(EXTRA);
    return s;
  }
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
  dbPut(k, { blob: v.blob, plain: v.plain, nostamp: v.nostamp, upPlain: v.upPlain, gid: v.gid, gidP: v.gidP, gs: v.gs, shot: v.shot, native: v.native, gal: v.gal, remote: v.remote, size: v.size, sizeP: v.sizeP, hasPlain: v.hasPlain, skip: v.skip, mix: v.mix, fromGal: v.fromGal, report: v.report, metaDirty: v.metaDirty, fixed: v.fixed, reup: v.reup, t: v.t, dur: v.dur, title: v.title, mime: v.mime, ext: v.ext, up: v.up, room: v.room, st: v.st, kind: "video" });
}
const REC_FIELDS = ["blob", "orig", "t", "lat", "lng", "acc", "hash", "warn", "cap", "up", "sv", "synced", "path", "prevPath", "gid", "gmod", "gs", "gpath", "away", "gal", "raw", "gidP", "galP"];
function persist(k) {
  const ph = photos.get(k); if (!ph) return dbPut(k, null);
  const rec = {}; REC_FIELDS.forEach(f => (rec[f] = ph[f])); dbPut(k, rec);
  if (!ph.gs) cloudSoon();
}
/* Catat file Drive yang harus dibuang ke Sampah Drive setelah foto/video dihapus di HP ini */
function cloudForget(rec) {
  if (!rec) return;
  const ids = [rec.gid, rec.gidP].filter(Boolean); if (!ids.length) return;
  try { const t = JSON.parse(localStorage.getItem("kka-gtomb") || "[]"); localStorage.setItem("kka-gtomb", JSON.stringify([...t, ...ids])); } catch (e) {}
  cloudSoon();
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
  cloudStateSoon();
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
  $(id).addEventListener("input", e => {
    profil[k] = e.target.value; if (k === "alamat") profil.alamatAuto = false; saveState();
    if (k === "nama" || k === "npsn") renderHeader();
    if (k === "wil" || k === "alamat") renderKoorWarn();
  });
}
$("aGrup").innerHTML = GROUPS.map(g => `<option>${g}</option>`).join("");
$("pGaya").value = profil.gaya || "lengkap";
$("pPeta").value = profil.peta || "satelit";
if (window.KKAGeo) KKAGeo.setSource(profil.peta || "satelit");
$("pPeta").addEventListener("change", e => {
  profil.peta = e.target.value; saveState(); KKAGeo.setSource(profil.peta);
  const g = currentGps(); if (g && navigator.onLine) KKAGeo.prefetch(g.lat, g.lng);
  toast(profil.peta === "satelit" ? "Peta di cap: satelit." : "Peta di cap: jalan (OpenStreetMap).");
});
$("pGaya").addEventListener("change", e => { profil.gaya = e.target.value; saveState(); render(); toast(e.target.value === "lengkap" ? "Cap lengkap: peta, alamat, Lat/Long, waktu." : "Cap ringkas: 3 baris."); });
// Alamat otomatis dari GPS / koordinat sekolah (OpenStreetMap), tetap bisa diubah manual
async function fillAlamat(force) {
  if (profil.lokKunci) return; // lokasi sekolah dikunci: alamat tidak diubah otomatis
  const g = currentGps(); if (!g) { if (force) toast("Lokasi belum ada. Aktifkan GPS atau isi koordinat sekolah."); return; }
  if (!force && profil.alamat) return;
  if (!navigator.onLine) { if (force) toast("Butuh internet untuk mencari alamat."); return; }
  $("pAlamatBtn").disabled = true;
  const a = await KKAGeo.reverse(g.lat, g.lng, force);
  $("pAlamatBtn").disabled = false;
  if (a) { profil.alamat = a; profil.alamatAuto = true; $("pAlamat").value = a; saveState(); renderKoorWarn(); if (force) toast("Alamat diisi dari lokasi."); }
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
  renderKoorWarn();
  if (screen === "kegiatan" && $("kegLocHint")) try { renderKegLoc(); } catch (e) {}
  if (!fix) return;
  $("gpsBtn").hidden = true; $("gpsRetry").hidden = false;
  $("useHereBtn").hidden = !(fix.acc <= 30) || !!profil.lokKunci;
  const far = farFromSchool(fix);
  if (far > KKA.LIMIT.schoolFar && koorSuspect()) {
    setGps("err", `Lokasi HP terbaca ${(far / 1000).toFixed(0)} km dari koordinat sekolah — koordinat sekolah kemungkinan salah tanda minus`);
    showHelp(""); return;
  }
  if (far > KKA.LIMIT.schoolFar) {
    setGps("err", `Lokasi HP terbaca ${(far / 1000).toFixed(far >= 10000 ? 0 : 1)} km dari sekolah (±${fix.acc} m) — tidak dipakai, foto memakai koordinat sekolah`);
    showHelp(fix.acc <= KKA.LIMIT.gpsAcc
      ? "Bila Anda memang di sekolah dan GPS ini benar, berarti koordinat sekolah yang keliru: ketuk \"Jadikan koordinat sekolah\"."
      : HELP_APPROX);
    return;
  }
  if (!schoolKoor() && fix.acc >= KKA.LIMIT.approx) {
    setGps("err", `Lokasi perkiraan ±${fix.acc} m — tidak dicetak. Isi koordinat sekolah atau aktifkan lokasi akurat.`);
    showHelp(HELP_APPROX); return;
  }
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
/* Deteksi koordinat sekolah yang kehilangan tanda minus (mis. 2.4773 padahal -2.4773).
   Sekolah di selatan khatulistiwa (Kalsel, Jawa, Bali, NTB/NTT, dst.) lintangnya harus negatif. */
const SOUTH_RE = /kalimantan selatan|kalsel|hulu sungai|banjar|tapin|tabalong|balangan|barito|kotabaru|tanah laut|tanah bumbu|kalimantan tengah|kalteng|jawa|jakarta|banten|yogyakarta|diy|bali|nusa tenggara|ntb|ntt|lampung|sumatera selatan|sumsel|bengkulu|jambi|bangka|belitung|sulawesi selatan|sulsel|sulawesi tenggara|sultra|sulawesi barat|sulbar|maluku|papua selatan/i;
const FOREIGN_RE = /malaysia|sarawak|sabah|brunei|singapore|singapura|philippines|filipina/i;
function koorSuspect() {
  const sk = schoolKoor(); if (!sk || sk.lat <= 0 || profil.lokKunci) return null;
  const flip = { lat: -sk.lat, lng: sk.lng };
  const near = fix && KKA.distanceM(fix, sk) > 50000 && KKA.distanceM(fix, flip) < 30000;
  const why = near ? "Lokasi HP Anda justru dekat dengan titik bertanda minus."
    : SOUTH_RE.test(profil.wil || "") ? "Wilayah sekolah berada di selatan khatulistiwa, jadi lintangnya harus diawali minus (-)."
    : FOREIGN_RE.test(profil.alamat || "") ? "Titik ini jatuh di luar Indonesia (lihat alamat)." : "";
  return why ? { flip, why } : null;
}
/* Kunci lokasi sekolah: koordinat & alamat tidak bisa diubah (tidak tertimpa GPS/"Isi dari GPS")
   sampai operator membuka kuncinya. */
function renderLock() {
  const on = !!profil.lokKunci, sk = schoolKoor();
  $("pKoor").readOnly = on; $("pAlamat").readOnly = on;
  $("pAlamatBtn").hidden = on; $("gpsCard").classList.toggle("locked", on);
  $("lockBtn").textContent = on ? "🔓 Buka kunci" : "🔒 Kunci lokasi sekolah";
  $("lockBtn").disabled = !on && !sk;
  $("lockInfo").textContent = on
    ? "Terkunci. Koordinat & alamat sekolah tidak akan berubah. Bila GPS HP lemah atau jauh dari sekolah, foto memakai lokasi ini."
    : sk ? "Kunci agar koordinat & alamat tidak tertimpa atau terhapus tanpa sengaja." : "Isi koordinat sekolah dulu sebelum mengunci.";
  if (on) $("useHereBtn").hidden = true;
}
$("lockBtn").addEventListener("click", () => {
  if (!profil.lokKunci) {
    if (!schoolKoor()) { toast("Isi koordinat sekolah dulu."); return; }
    profil.lokKunci = true; saveState(); toast("Lokasi sekolah dikunci.");
  } else if ($("lockBtn").dataset.ask !== "1") {
    $("lockBtn").dataset.ask = "1"; $("lockBtn").textContent = "Ketuk lagi untuk membuka kunci";
    setTimeout(() => { $("lockBtn").dataset.ask = ""; renderLock(); }, 4000); return;
  } else {
    $("lockBtn").dataset.ask = ""; profil.lokKunci = false; saveState(); toast("Kunci dibuka. Koordinat & alamat bisa diubah.");
  }
  renderLock(); renderGps();
});
function renderKoorWarn() {
  renderLock();
  const s = koorSuspect(), sk = schoolKoor();
  const foreign = FOREIGN_RE.test(profil.alamat || "") && !profil.lokKunci;
  $("koorWarn").hidden = !s && !foreign;
  if (s) {
    $("koorWarnTxt").textContent = `Koordinat sekolah ${sk.lat}, ${sk.lng} berada di utara khatulistiwa (dekat Sarawak, Malaysia). ${s.why}`;
    $("koorFlip").hidden = false; $("koorFlip").textContent = `Perbaiki jadi ${s.flip.lat}, ${s.flip.lng}`;
  } else if (foreign) {
    $("koorWarnTxt").textContent = "Alamat lokasi terisi alamat luar negeri. Kosongkan lalu ketuk \"Isi dari GPS\" atau ketik alamat sekolah.";
    $("koorFlip").hidden = false; $("koorFlip").textContent = "Isi ulang alamat";
  }
}
$("koorFlip").addEventListener("click", () => {
  const s = koorSuspect();
  if (s) {
    profil.koor = `${s.flip.lat}, ${s.flip.lng}`; $("pKoor").value = profil.koor;
    toast(`Koordinat sekolah diperbaiki: ${profil.koor}`);
    if (window.KKAGeo && navigator.onLine) KKAGeo.prefetch(s.flip.lat, s.flip.lng);
  }
  refreshAlamatAfterKoor(true); saveState(); renderGps(); render();
});
// Setelah koordinat sekolah berubah, alamat otomatis (atau alamat luar negeri) ikut diperbarui
function refreshAlamatAfterKoor(force) {
  if (profil.lokKunci) return;
  if (force || profil.alamatAuto || FOREIGN_RE.test(profil.alamat || "")) {
    profil.alamat = ""; $("pAlamat").value = ""; saveState(); fillAlamat(true);
  }
}
$("useHereBtn").addEventListener("click", () => {
  if (!fix || fix.acc > 30) { toast("GPS belum cukup akurat (perlu ±30 m atau lebih baik)."); return; }
  profil.koor = `${fix.lat.toFixed(6)}, ${fix.lng.toFixed(6)}`; $("pKoor").value = profil.koor; saveState();
  toast(`Koordinat sekolah diisi dari GPS: ${profil.koor}`); refreshAlamatAfterKoor(false); renderGps(); render();
  if (window.KKAGeo && navigator.onLine) KKAGeo.prefetch(fix.lat, fix.lng);
});
$("pKoor").addEventListener("change", () => {
  const k = schoolKoor();
  if (profil.koor && !k) toast("Format koordinat belum dikenali. Contoh: -2.486486, 115.135429");
  else if (k) {
    toast(`Koordinat sekolah tersimpan: ${k.lat.toFixed(6)}, ${k.lng.toFixed(6)}`); if (window.KKAGeo && navigator.onLine) KKAGeo.prefetch(k.lat, k.lng);
    if (!koorSuspect()) refreshAlamatAfterKoor(false);
  }
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
    : `<span class="stg">${pn(st)}%<button type="button" data-stdel="${st}" aria-label="Hapus tahap ${pn(st)}%">×</button></span>`).join("");
}
$("stgChips").addEventListener("click", e => {
  const b = e.target.closest("[data-stdel]"); if (!b) return;
  const st = +b.dataset.stdel, n = stageCount(st);
  if (n) { toast(`Tahap ${pn(st)}% masih berisi ${n} foto. Hapus atau unduh fotonya dulu.`); return; }
  if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "hapus?"; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "×"; } }, 3000); return; }
  STAGES = STAGES.filter(x => x !== st); saveStages();
  if (view === st) view = 0;
  renderStageEd(); render(); toast(`Tahap ${pn(st)}% dihapus.`);
});
/* ---------- Ubah angka persen sebuah tahap (mis. 4% → 5%) ----------
   Foto & video tahap itu ikut pindah: kunci baru, cap dicetak ulang dengan persen baru, folder Drive ikut pindah. */
$("stgEditBtn").addEventListener("click", () => {
  $("stgEditFrom").textContent = view + "%"; $("stgEditIn").value = view; $("stgEditBox").hidden = false; $("stgEditIn").focus(); $("stgEditIn").select();
});
$("stgEditX").addEventListener("click", () => { $("stgEditBox").hidden = true; });
$("stgEditDel").addEventListener("click", e => {
  const st = view, n = stageCount(st), b = e.currentTarget;
  if (n) return toast(`Tahap ${pn(st)}% berisi ${n} foto. Ganti angkanya saja, atau hapus fotonya dulu.`);
  if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Ketuk lagi untuk menghapus"; setTimeout(() => { delete b.dataset.armed; b.textContent = "Hapus tahap ini"; }, 3000); return; }
  delete b.dataset.armed;
  STAGES = STAGES.filter(x => x !== st); saveStages(); saveState(); view = 0;
  try { localStorage.setItem("kka-view", "0"); } catch (er) {}
  $("stgEditBox").hidden = true; renderStageEd(); render(); toast(`Tahap ${pn(st)}% dihapus.`);
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target && e.target.id === "stgEditIn") $("stgEditOk").click(); });
$("stgEditOk").addEventListener("click", async e => {
  const from = view, to = parsePct($("stgEditIn").value);
  if (!Number.isFinite(to) || to <= 0 || to > 100) return toast("Isi angka persen lebih dari 0 sampai 100, boleh pakai koma (mis. 3,25).");
  if (to === from) { $("stgEditBox").hidden = true; return; }
  if (STAGES.includes(to)) return toast(`Tahap ${pn(to)}% sudah ada. Pilih angka lain, atau hapus tahap ${pn(to)}% dulu bila kosong.`);
  if (restamping) return toast("Tunggu proses cetak ulang yang sedang berjalan.");
  const b = e.currentTarget; b.disabled = true; restamping = true;
  const keys = [...photos.keys()].filter(k => !k.startsWith("#") && parseKey(k).st === from);
  let i = 0;
  for (const k of keys) {
    i++; b.textContent = `Memindahkan ${i}/${keys.length}…`;
    const q = parseKey(k), nk = KEY(q.pid, q.ak, to), ph = photos.get(k);
    const c = stampCtx(nk), sk = schoolKoor();
    const gps = ph.lat != null ? { lat: ph.lat, lng: ph.lng, acc: ph.acc ?? null, src: ph.acc == null ? "sekolah" : "gps" } : sk ? { ...sk, acc: null, src: "sekolah" } : null;
    let rec = { ...ph, gs: false, gal: undefined };
    if (!ph.raw) try {
      const img = await createImageBitmap(ph.orig || ph.blob);
      const res = await stamp(img, ph.t, gps, c.p, c.a, { ...c.opts, cover: !ph.orig });
      URL.revokeObjectURL(ph.url);
      rec = { ...rec, blob: res.blob, sv: res.sv, url: URL.createObjectURL(res.blob) };
    } catch (er) {}
    photos.delete(k); dbPut(k, null); photos.set(nk, rec); persist(nk);
  }
  for (const [k, v] of videos) if (v.st === from) {
    v.st = to; if (v.title) v.title = v.title.replace(stageName(from), stageName(to)); if (v.gid) v.metaDirty = true; persistVid(k);
  }
  STAGES = [...STAGES.filter(x => x !== from), to].sort((a, c) => a - c); saveStages(); saveState();
  view = to; try { localStorage.setItem("kka-view", String(to)); } catch (er) {}
  restamping = false; b.disabled = false; b.textContent = "Simpan"; $("stgEditBox").hidden = true;
  renderStageEd(); render(); cloudSoon(1500);
  toast(`Tahap ${pn(from)}% diganti menjadi ${pn(to)}%${keys.length ? ` (${keys.length} foto ikut pindah & cap diperbarui)` : ""}.`);
});
function addStageFromTab() {
  const n = parsePct($("tabAddIn").value);
  if (!Number.isFinite(n) || n <= 0 || n > 100) { toast("Isi angka persen lebih dari 0 sampai 100, boleh pakai koma (mis. 3,25)."); $("tabAddIn").focus(); return; }
  if (!STAGES.includes(n)) { STAGES = [...STAGES, n].sort((a, b) => a - b); saveStages(); saveState(); }
  view = n; try { localStorage.setItem("kka-view", String(view)); } catch (e) {}
  renderStageEd(); render(); toast(`Tahap ${pn(n)}% dibuka. Foto wajib: depan, samping, belakang, dalam.`);
}
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target && e.target.id === "tabAddIn") addStageFromTab(); });
$("stgAdd").addEventListener("click", () => {
  const n = parsePct($("stgNew").value);
  if (!Number.isFinite(n) || n <= 0 || n > 100) { toast("Isi angka persen lebih dari 0 sampai 100, boleh pakai koma (mis. 3,25)."); $("stgNew").focus(); return; }
  if (STAGES.includes(n)) { toast(`Tahap ${pn(n)}% sudah ada.`); return; }
  STAGES = [...STAGES, n].sort((a, b) => a - b); saveStages();
  $("stgNew").value = ""; renderStageEd(); render(); toast(`Tahap ${pn(n)}% ditambahkan.`);
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
  const cnt = st => paket.reduce((s, p) => s + reqCount(p, st), 0);
  const totalOf = st => paket.reduce((s, p) => s + reqAngles(p, st).length, 0);
  $("tabs").classList.toggle("scroll", STAGES.length > 5);
  $("tabs").style.gridTemplateColumns = STAGES.length > 5 ? "" : `repeat(${STAGES.length + 1},minmax(0,1fr))`;
  $("tabs").innerHTML = STAGES.map(st => {
    const n = cnt(st), total = totalOf(st);
    return `<button type="button" role="tab" data-view="${st}" aria-selected="${view === st}" class="tab${view === st ? " on" : ""}${n === total && total ? " full" : ""}">
      <b>${pn(st)}%</b><small>${n}/${total}</small></button>`;
  }).join("") + `<button type="button" class="tab tabadd" id="tabAdd" aria-label="Tambah tahap persen"><b>+</b><small>persen</small></button>`;
}
$("tabs").addEventListener("click", e => {
  if (e.target.closest("#tabAdd")) { // ketik persen sendiri, mis. 37
    const t = $("tabAdd");
    t.outerHTML = `<span class="tab tabadd on" id="tabAddBox"><input type="text" inputmode="decimal" id="tabAddIn" placeholder="mis. 3,25" aria-label="Persen tahap baru"><button type="button" id="tabAddOk">OK</button></span>`;
    $("tabAddIn").focus(); return;
  }
  if (e.target.closest("#tabAddOk")) return addStageFromTab();
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
  $("stgEditBtn").hidden = sc !== "foto" || !view; if (sc !== "foto" || !view) $("stgEditBox").hidden = true;
  if (sc === "kegiatan") { $("eyebrowStage").textContent = "Dokumentasi kegiatan"; renderKeg(); }
  if (sc === "video") renderVid();
  renderTrash(); renderHeader();
  renderCloud(); renderFix(); renderOldStamp(); renderWrongLoc(); renderKoorWarn();
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
    const need = reqAngles(p, st).length, n = reqCount(p, st);
    const slots = slotsFor(p, st);
    const pk = slots.map(a => KEY(p.id, a.k, st)).filter(k => photos.has(k));
    const allUp = pk.length && pk.every(k => photos.get(k).up);
    const el = document.createElement("article");
    el.className = "paket" + (n === need ? " done" : "");
    el.innerHTML = `<div class="ph"><h3>${esc(p.nama)}</h3><span class="chip">${n}/${need} wajib</span>
      <span class="ph-acts">${pk.length ? `<button class="mini-btn share" data-share="${esc(p.id)}" type="button">${allUp ? "✓ Drive" : "Unggah ke Drive"}</button>` : ""}
      <button class="iconbtn" data-del="${esc(p.id)}" type="button" aria-label="Hapus ruang ${esc(p.nama)} dari daftar">Hapus ruang</button></span></div>
      <div class="slots">${slots.map(a => {
        const k = KEY(p.id, a.k, st), ph = photos.get(k);
        const ref = !ph && st ? photos.get(KEY(p.id, a.k, 0)) : null; // foto 0% sebagai acuan
        return `<div class="slot${a.extra ? " extra" : ""}${a.legacy ? " legacy" : ""}">
          <button class="shot${ph ? " has" : ""}${ref ? " ref" : ""}" type="button" data-shoot="${esc(k)}" aria-label="${ph ? "Lihat" : "Ambil"} foto ${a.l} ${esc(p.nama)}">
            ${ph ? `<img src="${ph.url}" alt="">` : ref ? `<img src="${ref.url}" alt=""><span class="reflbl">acuan 0%</span>` : SVG[a.k]}
            <span class="cam">${ph ? "Lihat" : "Ambil foto"}</span>
            ${ph && ph.bad ? `<span class="badph">Foto rusak — pilih ulang lewat Galeri</span>` : ph && cloudOn() ? `<span class="sync${ph.gs ? " ok" : ""}">${ph.gs ? "☁ Drive" : "Antre"}</span>` : ""}
            ${ph && ph.gal ? `<span class="galmark" title="Sudah disimpan ke galeri">📥 Galeri</span>` : ""}
            ${ph && ph.orig && !ph.raw ? `<span class="v2mark" title="Tersimpan dengan stamp dan tanpa stamp">2 versi</span>` : ""}
            ${ph && ph.warn && ph.warn.length ? `<span class="warnb" title="${esc(ph.warn.join(" "))}">${ph.warn.length} catatan</span>` : ""}</button>
          <div class="slab"><span>${a.l}</span><span class="slab-acts">${ph
            ? `<button type="button" data-retake="${esc(k)}">Ulangi</button>`
            : `<button type="button" class="gbtn" data-guide="${esc(k)}">Panduan</button>`}<button type="button" class="gbtn" data-gal="${esc(k)}" aria-label="Pilih dari galeri: ${a.l} ${esc(p.nama)}">Galeri</button></span></div>
        </div>`;
      }).join("")}</div>`;
    list.appendChild(el);
  }
  const total = paket.reduce((s, p) => s + reqAngles(p, st).length, 0);
  const cnt = paket.reduce((s, p) => s + reqCount(p, st), 0);
  const anyPhoto = stageKeys(st).length > 0;
  $("tCount").textContent = cnt; $("tOf").hidden = false; $("tTotal").textContent = total; $("tUnit").textContent = `foto wajib ${pn(st)}%`;
  $("tBar").style.width = total ? (cnt / total) * 100 + "%" : "0";
  $("zipBtn").disabled = !anyPhoto; $("shareAllBtn").disabled = !anyPhoto; $("galAllBtn").disabled = !anyPhoto; $("galPlainBtn").disabled = !anyPhoto; renderShareBtn();
  const kurang = paket.filter(p => reqCount(p, st) < reqAngles(p, st).length).length;
  $("dockMsg").textContent = !profil.nama
    ? "Isi dulu nama sekolah dan NPSN, lalu ketuk kotak foto untuk membuka kamera."
    : !anyPhoto ? (st ? `Tahap ${pn(st)}%: foto wajib Tampak Depan, Samping, Belakang, dan Dalam Ruangan. Foto 0% tampil samar di kamera sebagai acuan bila ada.` : "Ketuk kotak foto untuk membuka kamera. Foto langsung diberi cap identitas.")
    : kurang ? `${stageName(st)}: ${kurang} menu paket belum lengkap foto wajibnya.`
    : `${stageName(st)} lengkap. Ketuk Unggah ke Drive.`;
}

/* Foto kegiatan dikelompokkan per judul (mis. "H2 pembongkaran"): satu folder per judul di Drive & ZIP */
const kegFolder = ph => clean((ph.cap || "").trim() || "Tanpa judul");
function kegGroups(keys) {
  const g = new Map();
  for (const k of keys) { const ph = photos.get(k), f = kegFolder(ph); if (!g.has(f)) g.set(f, []); g.get(f).push(k); }
  return [...g.entries()].sort((a, b) => Math.max(...b[1].map(k => photos.get(k).t)) - Math.max(...a[1].map(k => photos.get(k).t)));
}
function renderKeg() {
  const keys = kegKeys();
  renderKegChips(); renderKegLoc(); renderKegDay();
  $("kegList").innerHTML = keys.length ? kegGroups(keys).map(([f, ks]) => `<section class="keggroup">
    <div class="keghead"><b>📁 ${esc(f)}</b><small>${ks.length} foto</small>
      <button class="btn" type="button" data-kegshare="${esc(f)}">Unggah ke Drive</button>
      <button class="btn" type="button" data-keggal="${esc(f)}">Simpan ke galeri</button>
      <button class="btn" type="button" data-kegplain="${esc(f)}">Simpan tanpa stamp</button>
      <button class="btn" type="button" data-kegvid="${esc(f)}">🎞️ Jadikan video</button>
      <button class="btn ghost" type="button" data-kegren="${esc(f)}">✏️ Ubah judul</button></div>
    <div class="keggrid">${ks.map(k => {
    const ph = photos.get(k);
    return `<figure class="kegitem"><button type="button" class="shot has" data-view-k="${esc(k)}" aria-label="Lihat ${esc(ph.cap || "foto kegiatan")}">
      <img src="${ph.url}" alt="">${ph.bad ? '<span class="badph">Foto rusak — hapus lalu impor ulang</span>' : ""}${ph.up || ph.gs ? '<span class="sync ok">✓ Drive</span>' : ""}${ph.gal ? '<span class="galmark">📥 Galeri</span>' : ""}${ph && ph.orig && !ph.raw ? `<span class="v2mark" title="Tersimpan dengan stamp dan tanpa stamp">2 versi</span>` : ""}</button>
      <figcaption><small>${tgl(ph.t)} ${jam(ph.t)}${ph.away ? " · 📍 luar sekolah" : ""}</small></figcaption></figure>`;
  }).join("")}</div></section>`).join("") : `<p class="hint">Belum ada foto kegiatan. Pilih atau ketik keterangan di atas, lalu ketuk <b>Ambil foto kegiatan</b>.</p>`;
  $("tCount").textContent = keys.length; $("tOf").hidden = true; $("tUnit").textContent = "foto kegiatan";
  $("tBar").style.width = keys.length ? "100%" : "0";
  $("zipBtn").disabled = !keys.length; $("shareAllBtn").disabled = !keys.length; $("galAllBtn").disabled = !keys.length; $("galPlainBtn").disabled = !keys.length; renderShareBtn();
  $("dockMsg").textContent = keys.length ? `${keys.length} foto kegiatan. Ketuk Unggah ke Drive untuk mengirim semuanya.`
    : "Foto kegiatan: rapat, pekerjaan berlangsung, material datang, serah terima.";
}
/* ---------- Nomor hari pekerjaan (H1, H2, …) otomatis dari tanggal mulai ---------- */
const H_RE = /^H\s?(\d+)\s+(.+)$/i;
const dayStart = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
function hNum(ms) {
  if (!profil.kegStart) return null;
  const [y, m, d] = profil.kegStart.split("-").map(Number);
  const n = Math.round((dayStart(ms) - new Date(y, m - 1, d).getTime()) / 86400000) + 1;
  return n >= 1 ? n : null;
}
const withH = (cap, ms) => { const n = hNum(ms); if (!n) return cap; const mm = cap.match(H_RE); return `H${n} ${mm ? mm[2] : cap}`; };
// Foto berjudul "H<angka> …" yang angkanya tidak cocok dengan tanggal fotonya
function hFixes() {
  const out = new Map(); // "folderLama|tanggal" -> {f, day, cap, n}
  if (!profil.kegStart) return out;
  for (const k of kegKeys()) {
    const ph = photos.get(k), mm = (ph.cap || "").match(H_RE); if (!mm) continue;
    const want = withH(ph.cap, ph.t); if (want === ph.cap) continue;
    const key = kegFolder(ph) + "|" + tgl(ph.t), e = out.get(key) || { f: kegFolder(ph), day: tgl(ph.t), cap: want, n: 0 };
    e.n++; out.set(key, e);
  }
  return out;
}
function renderKegDay() {
  $("kegStart").value = profil.kegStart || "";
  const n = hNum(Date.now());
  $("kegHInfo").textContent = profil.kegStart
    ? (n ? `Hari ini = H${n}. Ketuk kegiatan di atas: nomor H otomatis ditambahkan.` : "Tanggal mulai ada di masa depan.")
    : "Isi tanggal mulai pekerjaan agar nomor hari (H1, H2, …) dihitung otomatis.";
  const fx = hFixes(), cnt = [...fx.values()].reduce((a, e) => a + e.n, 0);
  $("kegRenum").hidden = !cnt;
  $("kegRenum").textContent = `Sesuaikan nomor H: ${cnt} foto tidak cocok dengan tanggalnya`;
}
$("kegStart").addEventListener("change", e => {
  profil.kegStart = e.target.value || undefined; saveState(); renderKegDay(); renderKegChips();
  const n = hNum(Date.now()); if (n) toast(`Hari ini H${n}.`);
});
$("kegRenum").addEventListener("click", async e => {
  const b = e.currentTarget, fx = [...hFixes().values()];
  if (!fx.length) return;
  if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = `Ketuk lagi: ubah ${fx.map(x => `${x.f} (${x.day.slice(8)}/${x.day.slice(5, 7)}) → ${x.cap}`).join("; ")}`;
    setTimeout(() => { delete b.dataset.armed; renderKegDay(); }, 8000); return; }
  delete b.dataset.armed; b.disabled = true;
  for (const x of fx) await retitleKeg(x.f, x.cap, b, [x.day]);
  b.disabled = false; renderKegDay(); toast("Nomor H semua foto kegiatan sudah disesuaikan dengan tanggalnya.");
});

/* Pilihan kegiatan siap ketuk: judul yang pernah dipakai (terbaru dulu) + daftar kegiatan umum revitalisasi */
function renderKegChips() {
  const used = [], seen = new Set();
  [...photos.entries()].filter(([k]) => k.startsWith("#keg|")).sort((a, b) => b[1].t - a[1].t)
    .forEach(([, ph]) => { const c = (ph.cap || "").trim(); if (c && !seen.has(c.toLowerCase())) { seen.add(c.toLowerCase()); used.push(c); } });
  const preset = KEG_PRESET.filter(t => !seen.has(t.toLowerCase()));
  const cur = $("kegCap").value.trim().toLowerCase();
  const chip = t => `<button type="button" class="kchip${t.toLowerCase() === cur ? " on" : ""}" data-kcap="${esc(t)}">${esc(t)}</button>`;
  $("kegChips").innerHTML = (used.length ? `<small>Terakhir dipakai</small><div>${used.slice(0, 8).map(chip).join("")}</div>` : "")
    + `<small>Kegiatan umum</small><div>${preset.map(chip).join("")}</div>`;
  $("kegCapList").innerHTML = [...used, ...preset].map(t => `<option value="${esc(t)}">`).join("");
}
$("kegChips").addEventListener("click", e => {
  const b = e.target.closest("[data-kcap]"); if (!b) return;
  $("kegCap").value = withH(b.dataset.kcap, Date.now()); renderKegChips();
  toast(`Kegiatan: ${$("kegCap").value}. Ketuk Ambil foto atau Pilih dari galeri.`);
});
$("kegCap").addEventListener("input", () => {
  const cur = $("kegCap").value.trim().toLowerCase();
  $("kegChips").querySelectorAll(".kchip").forEach(b => b.classList.toggle("on", b.dataset.kcap.toLowerCase() === cur));
});
$("kegShoot").addEventListener("click", () => {
  const cap = $("kegCap").value.trim();
  if (!cap) { toast("Isi keterangan kegiatan dulu, mis. \"Pekerjaan atap\"."); $("kegCap").focus(); return; }
  openCamera("#keg|" + Date.now().toString(36), cap);
});
$("kegList").addEventListener("click", e => {
  const b = e.target.closest("[data-view-k]"); if (b) openViewer(b.dataset.viewK);
  const sh = e.target.closest("[data-kegshare]");
  if (sh) { const f = sh.dataset.kegshare; shareKeys(kegKeys().filter(k => kegFolder(photos.get(k)) === f), `Kegiatan - ${f}`); }
  const rn = e.target.closest("[data-kegren]");
  if (rn) { // ubah judul satu kelompok: kotak isian di kepala kelompok
    const f = rn.dataset.kegren, head = rn.closest(".keghead"), cur = photos.get(kegKeys().find(k => kegFolder(photos.get(k)) === f)).cap || f;
    // pilihan tanggal: bila satu kelompok berisi foto beberapa hari, judul bisa diganti hanya untuk hari tertentu
    const days = new Map(); kegKeys().filter(k => kegFolder(photos.get(k)) === f).forEach(k => { const d = tgl(photos.get(k).t); days.set(d, (days.get(d) || 0) + 1); });
    const hari = d => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" }); };
    head.innerHTML = `<label class="f" style="flex:1 1 100%;min-width:0;margin:0">Judul baru untuk ${esc(f)}<input type="text" data-renin value="${esc(cur)}" maxlength="80"></label>
      ${days.size > 1 ? `<div class="rendays"><small>Ganti judul untuk foto tanggal:</small>${[...days].sort().map(([d, n]) =>
        `<label class="chk"><input type="checkbox" data-rend="${d}" checked> ${esc(hari(d))} (${n} foto)</label>`).join("")}</div>` : ""}
      <button class="btn primary" type="button" data-renok="${esc(f)}">Simpan judul</button><button class="btn ghost" type="button" data-renx>Batal</button>`;
    const inp = head.querySelector("[data-renin]"); inp.focus(); inp.select(); return;
  }
  if (e.target.closest("[data-renx]")) { render(); return; }
  const ok = e.target.closest("[data-renok]");
  if (ok) {
    const head = ok.closest(".keghead"), v = head.querySelector("[data-renin]").value.trim();
    const boxes = [...head.querySelectorAll("[data-rend]")], days = boxes.length ? boxes.filter(b => b.checked).map(b => b.dataset.rend) : null;
    if (days && !days.length) return toast("Pilih minimal satu tanggal.");
    retitleKeg(ok.dataset.renok, v, ok, days); return;
  }
  const gg = e.target.closest("[data-keggal]");
  if (gg) { const f = gg.dataset.keggal; saveToGallery(kegKeys().filter(k => kegFolder(photos.get(k)) === f).map(phItem), `Kegiatan - ${f}`); }
  const gv = e.target.closest("[data-kegvid]");
  if (gv) kegToVideo([gv.dataset.kegvid]);
  const gp = e.target.closest("[data-kegplain]");
  if (gp) { const f = gp.dataset.kegplain; savePlain(kegKeys().filter(k => kegFolder(photos.get(k)) === f), `Kegiatan - ${f} (tanpa stamp)`); }
});

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
  const p = paket.find(x => x.id === pid), a = angleOf(ak, st);
  const ref = st ? photos.get(KEY(pid, ak, 0)) : null;
  const SUB = {
    serongkanan: "Garis kuning putus-putus = posisi pojok depan kanan bangunan.",
    serongkiri: "Garis kuning putus-putus = posisi pojok depan kiri bangunan.",
    depan: "Seluruh bangunan dan atap masuk bingkai, lurus menghadap fasad.",
    belakang: "Seluruh dinding belakang dan atap masuk bingkai.",
    ruang: "Dari pojok ruangan, arahkan diagonal: lantai, dinding, plafon.",
    samping: "Seluruh dinding samping dari ujung ke ujung, beserta atap, masuk bingkai.",
  };
  KKACam.open({
    title: `${a.l.toUpperCase()} — ${p.nama.toUpperCase()} · ${pn(st)}%`,
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
  if (screen === "kegiatan" && kegAway) { const g = awayGps(); return g ? { ok: g.acc <= KKA.LIMIT.gpsAcc, label: `Luar sekolah ±${g.acc} m` } : { ok: false, label: "Luar sekolah · GPS…" }; }
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
  const { pid, ak, st } = parseKey(k);
  const p = paket.find(q => q.id === pid), a = angleOf(ak, st);
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
    g = e.target.closest("[data-guide]"), sh = e.target.closest("[data-share]"), gl = e.target.closest("[data-gal]");
  if (gl) { galTarget = gl.dataset.gal; $("galPick").click(); return; }
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
  paketPhotoKeys(id).forEach(k => { const ph = photos.get(k); if (ph && ph.url) URL.revokeObjectURL(ph.url); cloudForget(ph); photos.delete(k); dbPut(k, null); });
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

let vidAddrBusy = false;
let vidAudio = true;
try { vidAudio = localStorage.getItem("kka-vaudio") !== "0"; } catch (e) {}
$("vidAudio").checked = vidAudio;
/* Stamp di video: "both" = satu rekaman menghasilkan dua file (bercap + polos), "stamp", atau "plain" */
let vidQuality = "1080";
try { vidQuality = localStorage.getItem("kka-vqual") || "1080"; } catch (e) {}
$("pVQual").value = vidQuality;
$("pVQual").addEventListener("change", e => { vidQuality = e.target.value; try { localStorage.setItem("kka-vqual", vidQuality); } catch (er) {}
  toast(vidQuality === "1080" ? "Perekam aplikasi: Full HD 1080p (lebih tajam, file lebih besar)." : "Perekam aplikasi: HD 720p (lebih ringan)."); });
let vidHorizon = true;
try { vidHorizon = localStorage.getItem("kka-hlock") !== "0"; } catch (e) {}
$("pHLock").checked = vidHorizon;
$("pHLock").addEventListener("change", e => { vidHorizon = e.target.checked; try { localStorage.setItem("kka-hlock", vidHorizon ? "1" : "0"); } catch (er) {}
  toast(vidHorizon ? "Horizon video diluruskan otomatis (halus)." : "Horizon video tidak diluruskan: gambar persis seperti kamera."); });
// Setiap rekaman selalu menyimpan 2 file: dengan stamp + polos (tanpa stamp)
const vidStamp = "both";
const verBlob = (v, ver) => (ver === "polos" ? v.plain || (v.nostamp ? v.blob : null) : v.nostamp ? null : v.blob);
const verTag = v => (v.plain ? "2 versi" : v.nostamp ? "polos" : "stamp");
$("vidAudio").addEventListener("change", e => { vidAudio = e.target.checked; try { localStorage.setItem("kka-vaudio", vidAudio ? "1" : "0"); } catch (e) {} });

function saveVideo(v, msg) {
  const k = "#vid|" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  v.gs = false; v.fixed = 1; videos.set(k, v); persistVid(k); render(); cloudSoon();
  if (autoGal && !IS_IOS) { download(v.room ? `${clean(v.title || "video")}.${v.ext || "mp4"}` : `${clean(v.title || "video")} ${tgl(v.t)}.${v.ext || "mp4"}`, v.blob, true); v.gal = Date.now(); persistVid(k); }
  toast(msg || `Video tersimpan (${fmtDur(v.dur || 0)}, ${(v.blob.size / 1048576).toFixed(1)} MB).`);
  return k;
}

/* ---------- Video per ruangan (ketentuan Dokumentasi Bulanan revitsd.kemendikdasmen.go.id) ----------
   Folder utama Google Drive "VIDEO_REVITSD_<persen>" berisi subfolder per nama ruangan;
   tiap subfolder minimal 4 file rekaman video ASLI (tanpa edit) berdurasi 5–10 detik. */
const RV_MIN = 4, RV_MIN_SEC = 5, RV_MAX_SEC = 10;
/* Urutan sudut wajib per ruangan (4 video). Ruang "Lingkungan" memakai urutan sendiri. */
const RV_SHOTS = {
  ruang: [
    { id: "depan", s: "Depan", t: "Tampak depan", fig: "depan", d: "Berdiri 5–10 m di depan ruang, seluruh bangunan masuk bingkai. Tahan diam 2 detik, lalu geser pelan dari kiri ke kanan." },
    { id: "serong", s: "Serong", t: "Tampak serong/samping", fig: "serongkanan", d: "Pindah ke sudut bangunan (serong 45°). Rekam sisi samping dan atap, geser pelan." },
    { id: "dalam", s: "Dalam", t: "Dalam ruangan", fig: "ruang", d: "Berdiri di ambang pintu. Rekam seluruh isi ruang: dinding, lantai, plafon, jendela. Geser pelan." },
    { id: "detail", s: "Detail", t: "Detail pekerjaan", fig: "samping", d: "Dekati bagian yang rusak atau sedang dikerjakan: atap, plafon, dinding, lantai, pintu/jendela. Tahan stabil." },
  ],
  lingkungan: [
    { id: "akses", s: "Akses", t: "Gerbang/akses masuk", fig: "depan", d: "Berdiri di gerbang atau jalan masuk sekolah. Rekam ke arah area pekerjaan, geser pelan." },
    { id: "halaman", s: "Halaman", t: "Halaman menyeluruh", fig: "serongkanan", d: "Dari titik yang tinggi/lapang, rekam seluruh halaman. Geser pelan kiri ke kanan." },
    { id: "titik", s: "Titik kerja", t: "Titik pekerjaan utama", fig: "samping", d: "Rekam lokasi pekerjaan utama (pagar, saluran, jalan, lapangan) dari jarak sedang." },
    { id: "detail", s: "Detail", t: "Detail pekerjaan", fig: "samping", d: "Dekati detail kondisi/hasil pekerjaan. Tahan stabil." },
  ],
};
const shotsFor = p => (/lingkungan/i.test(p.grup + " " + p.nama) ? RV_SHOTS.lingkungan : RV_SHOTS.ruang);
const shotOf = (p, v) => shotsFor(p).find(x => x.id === v.shot);
function nextShot(p, st) {
  const done = new Set(roomClips(p.id, st).map(([, v]) => v.shot));
  return shotsFor(p).find(x => !done.has(x.id)) || null;
}
let rvStage = null;
try { const x = localStorage.getItem("kka-rvstage"); if (x != null) rvStage = +x; } catch (e) {}
const rvSt = () => (rvStage != null && STAGES.includes(rvStage) ? rvStage : view);
const SHOT_ORDER = ["depan", "akses", "serong", "halaman", "dalam", "titik", "detail"];
const shotRank = v => { const i = SHOT_ORDER.indexOf(v.shot); return i < 0 ? 99 : i; };
const roomClips = (pid, st) => [...videos.entries()].filter(([, v]) => v.room === pid && v.st === st)
  .sort((a, b) => shotRank(a[1]) - shotRank(b[1]) || a[1].t - b[1].t);
const rvFolder = st => `VIDEO_REVITSD_${pn(st)}`;
const rvName = (p, i, v, ver) => { const sh = shotOf(p, v);
  return `${two(i + 1)} - ${clean(p.nama)}${sh ? " - " + clean(sh.t) : ""}${ver === "polos" && v.plain ? " - polos" : ""}.${v.ext || "mp4"}`; };
function renderRoomVid() {
  const st = rvSt();
  $("rvStage").innerHTML = STAGES.map(x => `<option value="${x}">${esc(stageName(x))}</option>`).join("");
  $("rvStage").value = String(st);
  $("rvFolder").textContent = rvFolder(st);
  let done = 0;
  $("rvList").innerHTML = paket.map(p => {
    const clips = roomClips(p.id, st), n = clips.length, ok = n >= RV_MIN; if (ok) done++;
    const allUp = n && clips.every(([, v]) => v.up || v.upPlain);
    const hasP = clips.some(([, v]) => v.plain || v.hasPlain || v.nostamp), hasS = clips.some(([, v]) => !v.nostamp);
    return `<div class="rvroom${ok ? " ok" : ""}">
      <div class="rvhead"><b>${esc(p.nama)}</b><span class="rvcount">${n}/${RV_MIN} video</span>${allUp ? '<small class="okc">✓ Drive</small>' : ""}</div>
      <div class="rvshots">${shotsFor(p).map((x, i) => { const has = clips.some(([, v]) => v.shot === x.id);
        return `<span class="${has ? "on" : ""}">${has ? "✓" : i + 1} ${esc(x.s)}</span>`; }).join("")}</div>
      ${clips.some(([, v]) => !v.shot) ? `<p class="hint rvwarn">Ada video tanpa label sudut. Ketuk nomor videonya lalu pilih <b>Sudut video ini</b> agar tersusun rapi.</p>` : ""}
      ${n ? `<div class="rvclips">${clips.map(([k, v], i) => `<button type="button" class="rvclip" data-rvplay="${esc(k)}" aria-label="Putar video ${i + 1}">${two(i + 1)}${shotOf(p, v) ? " " + esc(shotOf(p, v).s) : ""}<small>${Math.round(v.dur || 0)} dtk${v.native ? " · 📱" : v.plain || v.hasPlain ? " · 2v" : v.nostamp ? " · polos" : ""}${v.remote && !v.blob ? " · ☁" : ""}</small></button>`).join("")}</div>` : ""}
      <div class="acts"><button class="btn${ok ? "" : " primary"}" type="button" data-rvrec="${esc(p.id)}">${n ? "Rekam lagi" : "Rekam 4 video"}</button>
      <button class="btn" type="button" data-rvnat="${esc(p.id)}" title="Pakai aplikasi Kamera bawaan HP: stabil &amp; kualitas terbaik">📱 Kamera HP</button>
      ${hasP && hasS ? `<button class="btn${ok ? " primary" : ""}" type="button" data-rvshare="${esc(p.id)}" data-ver="stamp">Unggah (stamp)</button><button class="btn${ok ? " primary" : ""}" type="button" data-rvshare="${esc(p.id)}" data-ver="polos">Unggah (polos)</button>`
        : `<button class="btn${ok ? " primary" : ""}" type="button" data-rvshare="${esc(p.id)}" data-ver="${hasP ? "polos" : "stamp"}" ${n ? "" : "disabled"}>Unggah ke Drive</button>`}</div></div>`;
  }).join("");
  $("rvSum").textContent = `${done}/${paket.length} ruangan lengkap (min. ${RV_MIN} video @ ${RV_MIN_SEC}–${RV_MAX_SEC} detik)`;
}
$("rvStage").addEventListener("change", e => { rvStage = +e.target.value; try { localStorage.setItem("kka-rvstage", rvStage); } catch (er) {} renderRoomVid(); });
/* ---------- Rekam dengan aplikasi Kamera bawaan HP ----------
   <input capture> membuka kamera asli iPhone/Android (stabilisasi & kualitas penuh). Hasilnya video ASLI tanpa cap.
   Arahan sudut ditampilkan dulu di kartu ruangan; setelah merekam, durasi (5–10 dtk) dan orientasi (landscape) diperiksa. */
let natPending = null;
const natInput = document.createElement("input");
natInput.type = "file"; natInput.accept = "video/*"; natInput.setAttribute("capture", "environment"); natInput.hidden = true;
document.body.appendChild(natInput);
function natPanel(p, st) {
  const sh = nextShot(p, st);
  const card = $("rvList").querySelector(`[data-rvnat="${CSS.escape(p.id)}"]`).closest(".rvroom");
  card.querySelectorAll(".rvnat").forEach(x => x.remove());
  const box = document.createElement("div"); box.className = "rvnat";
  box.innerHTML = `<div class="rvnat-row"><i class="vr-fig">${sh && window.KKA ? KKA.PLAN[sh.fig] || "" : ""}</i>
      <div><b>${esc(sh ? sh.t : "Video tambahan")}</b><span>${esc(sh ? sh.d : "4 sudut wajib sudah lengkap. Rekam bagian lain yang perlu ditunjukkan.")}</span></div></div>
    <p class="hint" style="margin:0">Kamera HP akan terbuka. <b>Pegang HP mendatar (landscape)</b>, rekam <b>5–10 detik</b>, lalu tekan Gunakan/OK.</p>
    <div class="acts"><button class="btn primary" type="button" data-natgo="${esc(p.id)}">Buka Kamera HP</button><button class="btn ghost" type="button" data-natx>Batal</button></div>`;
  card.querySelector(".acts").after(box);
  natPending = { pid: p.id, st, shot: sh ? sh.id : undefined };
}
function videoMeta(blob) {
  return new Promise(res => {
    const v = document.createElement("video"), url = URL.createObjectURL(blob); let done = false;
    const fin = r => { if (done) return; done = true; URL.revokeObjectURL(url); res(r); };
    v.preload = "metadata"; v.muted = true; v.playsInline = true;
    v.onloadedmetadata = () => {
      if (isFinite(v.duration) && v.duration > 0) return fin({ dur: v.duration, w: v.videoWidth, h: v.videoHeight });
      v.ontimeupdate = () => { v.ontimeupdate = null; fin({ dur: v.duration, w: v.videoWidth, h: v.videoHeight }); };
      try { v.currentTime = 1e6; } catch (e) { fin({ dur: 0, w: v.videoWidth, h: v.videoHeight }); }
    };
    v.onerror = () => fin(null);
    setTimeout(() => fin({ dur: 0, w: v.videoWidth || 0, h: v.videoHeight || 0 }), 8000);
    v.src = url;
  });
}
/* Video .mov dari iPhone: wadahnya sama dengan MP4 (ISO BMFF). Merek ftyp diganti ke mp42 tanpa mengubah ukuran,
   sehingga tersimpan sebagai .mp4 sesuai syarat portal. */
async function movToMp4(file) {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const t = String.fromCharCode(...head.slice(4, 8));
  if (t !== "ftyp") return null;
  const size = (head[0] << 24 | head[1] << 16 | head[2] << 8 | head[3]) >>> 0;
  if (size < 16 || size > 64) return null;
  const f = head.slice(0, size);
  const put = (o, s4) => { for (let i = 0; i < 4; i++) f[o + i] = s4.charCodeAt(i); };
  put(8, "mp42"); f.fill(0, 12, 16);
  for (let o = 16; o + 4 <= size; o += 4) put(o, o === 16 ? "isom" : "mp42");
  return new Blob([f, file.slice(size)], { type: "video/mp4" });
}
natInput.addEventListener("change", async () => {
  const file = natInput.files && natInput.files[0]; natInput.value = "";
  const pend = natPending; natPending = null;
  $("rvList").querySelectorAll(".rvnat").forEach(x => x.remove());
  if (!file || !pend) return;
  const p = paket.find(x => x.id === pend.pid); if (!p) return;
  toast("Memeriksa video…");
  const m = await videoMeta(file);
  if (!m) return toast("Video tidak bisa dibaca. Di iPhone: Pengaturan › Kamera › Format › pilih \"Paling Kompatibel\", lalu rekam ulang.");
  if (m.w && m.h && m.h > m.w) return toast("Video direkam TEGAK (portrait). Ketentuan wajib mendatar (landscape) — rekam ulang dengan HP dimiringkan.");
  if (m.dur && m.dur < RV_MIN_SEC - 0.3) return toast(`Video terlalu pendek (${m.dur.toFixed(1)} dtk). Minimal ${RV_MIN_SEC} detik — rekam ulang.`);
  if (m.dur && m.dur > RV_MAX_SEC + 0.7) return toast(`Video terlalu panjang (${m.dur.toFixed(1)} dtk). Maksimal ${RV_MAX_SEC} detik — rekam ulang lebih singkat.`);
  const isMov = /quicktime|\.mov$/i.test(file.type + " " + file.name);
  let blob = file, ext = "mp4", mime = file.type || "video/mp4";
  if (isMov) { const b = await movToMp4(file); if (b) { blob = b; mime = "video/mp4"; } else { ext = "mov"; mime = "video/quicktime"; } }
  else if (/webm/.test(mime)) ext = "webm";
  else blob = new Blob([file], { type: mime });
  const sh = shotsFor(p).find(x => x.id === pend.shot);
  const t = file.lastModified && Math.abs(Date.now() - file.lastModified) < 3600e3 ? file.lastModified : Date.now();
  saveVideo({ blob, mime, ext, dur: m.dur || 0, t, title: `${p.nama} · ${sh ? sh.t : "Video tambahan"} · ${stageName(pend.st)}`,
    room: p.id, st: pend.st, shot: pend.shot, nostamp: true, native: true },
    `Video Kamera HP tersimpan (${(m.dur || 0).toFixed(1)} dtk, ${(blob.size / 1048576).toFixed(1)} MB).${(() => { const nx = shotsFor(p).find(x => x.id !== pend.shot && !roomClips(p.id, pend.st).some(([, c]) => c.shot === x.id)); return nx ? " Berikutnya: " + nx.t + "." : ""; })()}`);
});

// Label sudut & pilihan "pakai di video utuh" untuk klip yang sudah direkam (mis. sebelum ada arahan sudut)
$("rvList").addEventListener("change", e => {
  const sh = e.target.closest("[data-rvshot]"), use = e.target.closest("[data-rvuse]");
  if (sh) {
    const v = videos.get(sh.dataset.rvshot); if (!v) return;
    v.shot = sh.value || undefined;
    { const p0 = paket.find(x => x.id === v.room), s0 = p0 && shotOf(p0, v);
      if (p0) v.title = `${p0.nama} · ${s0 ? s0.t : "Video tambahan"} · ${stageName(v.st)}`; }
    // urutan & nama file di Drive (01, 02, … + sudut) ikut berubah untuk seluruh klip ruangan ini
    roomClips(v.room, v.st).forEach(([kk, c]) => { if (c.gid) c.metaDirty = true; persistVid(kk); });
    const p = paket.find(x => x.id === v.room);
    toast(v.shot ? `Ditandai: ${shotOf(p, v).t}. Urutan video disusun ulang.` : "Ditandai sebagai video tambahan.");
    render(); cloudSoon(2000);
  }
  if (use) {
    const v = videos.get(use.dataset.rvuse); if (!v) return;
    v.skip = !use.checked || undefined; persistVid(use.dataset.rvuse);
    toast(use.checked ? "Video ini dipakai di video utuh." : "Video ini dilewati di video utuh (file aslinya tetap ada untuk Drive).");
  }
});
function recordRoom(p, st) {
  if (!profil.nama) { toast("Isi nama sekolah dan NPSN dulu."); return; }
  refreshGps();
  const clipNo = () => roomClips(p.id, st).length + 1;
  const extra = { s: "Tambahan", t: "Video tambahan", fig: "ruang", d: "4 sudut wajib sudah lengkap. Rekam bagian lain yang perlu ditunjukkan, atau tutup kamera (✕)." };
  const shot = () => nextShot(p, st) || extra;
  KKAVid.openRecorder({
    title: `${p.nama} · ${stageName(st)}`, titleFn: () => `${p.nama} · ${clipNo()}${clipNo() <= RV_MIN ? "/" + RV_MIN : ""} ${shot().t}`,
    shotFn: shot,
    multi: true, minSec: RV_MIN_SEC, maxSec: RV_MAX_SEC, stampMode: vidStamp, horizon: vidHorizon, quality: vidQuality,
    audio: vidAudio, idLine: `${profil.nama || "-"} · NPSN ${profil.npsn || "-"}`, zone: zoneLabel, gps: currentGps, tag: "VIDEO PER RUANGAN",
    address: vidAddress,
    onSaved: v => {
      const n = clipNo(), sh = shot();
      saveVideo({ ...v, title: `${p.nama} · ${sh.t} · ${stageName(st)}`, room: p.id, st, shot: sh === extra ? undefined : sh.id },
        n >= RV_MIN ? `Video ${n} tersimpan. ${p.nama} sudah ${n} video — boleh tutup kamera (✕).` : `Video ${n}/${RV_MIN} tersimpan. Berikutnya: ${(shotsFor(p).find(x => x.id !== sh.id && !roomClips(p.id, st).some(([, c]) => c.shot === x.id)) || extra).t}.`);
    },
    onError: m => toast(m),
    onUnsupported: () => toast("Perekam di aplikasi tidak didukung HP ini."),
  });
}
$("rvList").addEventListener("click", e => {
  const r = e.target.closest("[data-rvrec]"), sh = e.target.closest("[data-rvshare]"), pl = e.target.closest("[data-rvplay]");
  if (r) { const p = paket.find(x => x.id === r.dataset.rvrec); if (p) recordRoom(p, rvSt()); }
  const nat = e.target.closest("[data-rvnat]"), go = e.target.closest("[data-natgo]");
  if (nat) { const p = paket.find(x => x.id === nat.dataset.rvnat); if (p) natPanel(p, rvSt()); }
  if (go) natInput.click();
  if (e.target.closest("[data-natx]")) { natPending = null; e.target.closest(".rvnat").remove(); }
  if (sh) {
    const ver = sh.dataset.ver || "stamp", p = paket.find(x => x.id === sh.dataset.rvshare), st = rvSt();
    const clips = roomClips(p.id, st).map(([k, v], i) => [k, v, i]).filter(([, v]) => verBlob(v, ver));
    if (!clips.length) return toast(`Belum ada video versi ${ver}.`);
    if (clips.length < RV_MIN) toast(`Baru ${clips.length} video. Ketentuan minimal ${RV_MIN} video per ruangan.`);
    const files = clips.map(([, v, i]) => new File([verBlob(v, ver)], rvName(p, i, v, ver), { type: v.mime || v.blob.type, lastModified: v.t }));
    if (!navigator.share || !navigator.canShare || !navigator.canShare({ files: files.slice(0, 10) })) return toast("HP/browser ini belum mendukung kirim langsung ke Drive.");
    navigator.share({ files: files.slice(0, 10), title: `${p.nama} · ${rvFolder(st)}` }).then(() => {
      const now = Date.now(); clips.slice(0, 10).forEach(([k, v]) => { if (ver === "polos" && v.plain) v.upPlain = now; else v.up = now; persistVid(k); });
      render(); toast(`${Math.min(files.length, 10)} video ${p.nama} (${ver}) dibagikan. Pastikan masuk folder ${rvFolder(st)} › ${p.nama}.`);
    }).catch(er => { if (er && er.name !== "AbortError") toast("Gagal membuka menu Bagikan: " + er.message); });
  }
  if (pl) { // putar klip di dalam kartu ruang, dengan tombol hapus bila klip keliru
    const k = pl.dataset.rvplay, v = videos.get(k), card = pl.closest(".rvroom"); if (!v) return;
    const rp = paket.find(x => x.id === v.room) || { nama: "", grup: "" };
    if (!v.url) v.url = URL.createObjectURL(v.blob);
    card.querySelectorAll(".rvclip").forEach(b => b.classList.toggle("on", b === pl));
    let box = card.querySelector(".rvplay");
    if (!box) { box = document.createElement("div"); box.className = "rvplay"; card.querySelector(".rvclips").after(box); }
    if (v.plain && !v.purl) v.purl = URL.createObjectURL(v.plain);
    box.innerHTML = `<video src="${v.url}" controls autoplay playsinline></video>
      ${v.plain ? `<div class="seg"><button type="button" class="on" data-rvver="${v.url}">Dengan stamp</button><button type="button" data-rvver="${v.purl}">Polos</button></div>` : ""}
      <div class="rvedit">
        <label class="f">Sudut video ini<select data-rvshot="${esc(k)}"><option value="">— Tambahan / belum ditentukan —</option>
          ${shotsFor(rp).map(x => `<option value="${x.id}" ${v.shot === x.id ? "selected" : ""}>${esc(x.t)}</option>`).join("")}</select></label>
        <label class="chk"><input type="checkbox" data-rvuse="${esc(k)}" ${v.skip ? "" : "checked"}> Pakai di video utuh</label>
      </div>
      <div class="acts"><button class="btn" type="button" data-rvdl="${esc(k)}">Simpan ke galeri</button><button class="btn ghost" type="button" data-rvdel="${esc(k)}">Hapus video ${pl.firstChild.textContent}</button></div>`;
  }
  const vb = e.target.closest("[data-rvver]");
  if (vb) { const box = vb.closest(".rvplay"); box.querySelector("video").src = vb.dataset.rvver; box.querySelector("video").play().catch(() => {});
    box.querySelectorAll("[data-rvver]").forEach(b => b.classList.toggle("on", b === vb)); }
  const dl = e.target.closest("[data-rvdl]"), del = e.target.closest("[data-rvdel]");
  if (dl) { const v = videos.get(dl.dataset.rvdl), nm = clean(v.title || "video");
    saveToGallery(vidItems(dl.dataset.rvdl, `${nm}.${v.ext || "mp4"}`), "Simpan video"); }
  if (del) {
    if (!del.dataset.armed) { del.dataset.armed = 1; del.textContent = "Yakin hapus?"; setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = "Hapus"; } }, 3000); return; }
    const k = del.dataset.rvdel, v = videos.get(k); if (v && v.url) URL.revokeObjectURL(v.url); if (v && v.purl) URL.revokeObjectURL(v.purl);
    cloudForget(v); videos.delete(k); dbPut(k, null); render(); toast("Video dihapus. Nomor video berikutnya menyesuaikan.");
  }
});
function vidAddress(g) {
  if (profil.alamat && profil.alamat.trim()) return profil.alamat.trim();
  if (!g || !window.KKAGeo) return profil.wil || "";
  const c = KKAGeo.cached(g.lat, g.lng);
  if (!c && navigator.onLine && !vidAddrBusy) { vidAddrBusy = true; KKAGeo.reverse(g.lat, g.lng).finally(() => (vidAddrBusy = false)); }
  return c || profil.wil || "";
}
/* ---------- Video dari HP lain: diambil dari Drive saat dibutuhkan ---------- */
let vidFetching = false;
async function fetchVids(keys, why) {
  const miss = keys.filter(k => { const v = videos.get(k); return v && v.remote && !v.blob; });
  if (!miss.length) return true;
  if (!window.GD || !GD.valid) { toast("Video ini masih di Drive. Masuk Google dulu (Pengaturan › Sinkron antar-HP) untuk mengambilnya."); return false; }
  if (vidFetching) { toast("Sedang mengambil video, tunggu sebentar…"); return false; }
  vidFetching = true; let i = 0;
  try {
    for (const k of miss) {
      const v = videos.get(k); i++;
      if (!v.gid) { toast("Video ini belum ada di Drive akun yang sedang dipakai. Ambil dari HP yang merekamnya."); continue; }
      toast(`Mengambil video ${i}/${miss.length} dari Drive… (${(((v.size || 0) + (v.sizeP || 0)) / 1048576).toFixed(1)} MB)`);
      let blob = await GD.download(v.gid), plain = v.gidP ? await GD.download(v.gidP) : undefined;
      if (window.KKAFix) { if (await KKAFix.needsFix(blob)) blob = await KKAFix.fix(blob, v.dur); if (plain && await KKAFix.needsFix(plain)) plain = await KKAFix.fix(plain, v.dur); }
      Object.assign(v, { blob, plain, mime: blob.type || v.mime, remote: undefined, fixed: 1 }); persistVid(k);
    }
    render(); toast(why || `${miss.length} video siap.`); return true;
  } catch (e) { toast("Gagal mengambil video: " + e.message); return false; }
  finally { vidFetching = false; }
}
// Tombol yang butuh isi video: ambil dulu dari Drive. Putar → langsung diputar; bagikan/simpan → ketuk lagi (izin menu Bagikan harus dari ketukan).
function vidKeysOf(el) {
  const d = el.dataset;
  if (d.rvshare) return roomClips(d.rvshare, rvSt()).map(([k]) => k);
  return [d.rvplay || d.rvdl || d.vshare || d.vdl || d.vfetch].filter(Boolean);
}
["rvList", "vidList"].forEach(id => $(id).addEventListener("click", async e => {
  const el = e.target.closest("[data-rvplay],[data-rvdl],[data-rvshare],[data-vshare],[data-vdl],[data-vfetch]");
  if (!el) return;
  const keys = vidKeysOf(el);
  if (!keys.some(k => { const v = videos.get(k); return v && v.remote && !v.blob; })) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const play = el.dataset.rvplay || el.dataset.vfetch;
  if (await fetchVids(keys, play ? "Video siap." : "Video sudah diambil dari Drive. Ketuk tombolnya sekali lagi.") && el.dataset.rvplay) {
    const again = $("rvList").querySelector(`[data-rvplay="${CSS.escape(el.dataset.rvplay)}"]`); if (again) again.click();
  }
}, true));
$("cloudVidAll").addEventListener("click", () => fetchVids([...videos.keys()], "Semua video sudah tersimpan di HP ini."));
function renderVid() {
  renderRoomVid();
  $("vidTitleList").innerHTML = [...STAGES.map(st => `Keliling bangunan – ${stageName(st).toLowerCase()}`), "Kegiatan pekerjaan berlangsung", "Serah terima"]
    .map(t => `<option value="${esc(t)}">`).join("");
  const keys = [...videos.keys()].filter(k => !videos.get(k).room).sort((a, b) => videos.get(b).t - videos.get(a).t);
  $("vidList").innerHTML = keys.length ? "" : `<p class="hint empty">Belum ada video. Rekam di lokasi atau buat video laporan dari foto.</p>`;
  $("vidList").innerHTML += keys.map(k => {
    const v = videos.get(k);
    if (v.blob && !v.url) v.url = URL.createObjectURL(v.blob);
    const mb = v.blob ? (v.blob.size / 1048576).toFixed(1) : ((v.size || 0) / 1048576).toFixed(1);
    return `<div class="viditem" data-vkey="${esc(k)}">${v.blob ? `<video src="${v.url}" controls playsinline preload="metadata"></video>`
      : `<button type="button" class="vidremote" data-vfetch="${esc(k)}">☁ Video ada di Drive<small>Ketuk untuk mengambil (${mb} MB)</small></button>`}
      <div class="meta"><b>${esc(v.title || "Video")}</b><small>${tgl(v.t)} ${jam(v.t)} · ${fmtDur(v.dur || 0)} · ${mb} MB${v.plain || v.hasPlain ? " + versi polos" : v.nostamp ? " · polos" : ""}${v.fromGal ? " · dari galeri" : ""}</small>${v.up || v.upPlain || v.gs ? '<small class="okc">✓ Drive</small>' : ""}
        <label class="chk vmix"><input type="checkbox" data-vmix="${esc(k)}"${mixOn(v) ? " checked" : ""}> Masuk video gabungan</label></div>
      <div class="acts">${v.plain || v.hasPlain ? `<button class="btn primary" type="button" data-vshare="${esc(k)}">Unggah (stamp)</button><button class="btn primary" type="button" data-vshare="${esc(k)}" data-ver="polos">Unggah (polos)</button>`
        : `<button class="btn primary" type="button" data-vshare="${esc(k)}">Unggah ke Drive</button>`}
      <button class="btn" type="button" data-vdl="${esc(k)}">Simpan ke galeri</button>
      <button class="btn ghost" type="button" data-vren="${esc(k)}">✏️ Judul</button>
      <button class="btn ghost" type="button" data-vdel="${esc(k)}">Hapus</button></div></div>`;
  }).join("");
  // Daftar judul kegiatan untuk video gabungan (centang dipertahankan saat tampilan diperbarui)
  { const box = $("mkKeg"), had = box.dataset.init === "1", was = new Set([...box.querySelectorAll("input:checked")].map(i => i.value)),
      known = new Set([...box.querySelectorAll("input")].map(i => i.value));
    box.innerHTML = kegGroups(kegKeys()).map(([f, ks]) => `<label><input type="checkbox" value="${esc(f)}"${!had || was.has(f) || !known.has(f) ? " checked" : ""}> ${esc(f)} <small>(${ks.length})</small></label>`).join("")
      || `<p class="hint" style="margin:0">Belum ada foto kegiatan.</p>`;
    box.dataset.init = "1"; }
  try { const fm = localStorage.getItem("kka-mkfmt"); if (fm && !$("mkFmt").dataset.init) { $("mkFmt").value = fm; } $("mkFmt").dataset.init = "1"; } catch (e) {}
  // Pilihan isi video laporan
  const sel = $("mkScope"), prev = sel.value;
  const rvSts = STAGES.filter(st => paket.some(p => roomClips(p.id, st).length));
  const rvOpts = [...(keys.length ? [["vb", "Gabungan video pilihan (rekaman bebas & dari galeri)"]] : []),
    ["rv:all", "Gabungan video ruangan – semua tahap (0% → 100%)"], ...rvSts.map(st => ["rv:" + st, `Gabungan video ruangan – ${stageName(st)}`])];
  const phOpts = [["keg", "Foto kegiatan (pilih judul, bisa diselingi video)"], ["cmp", "Foto: perbandingan semua tahap per ruang (0% → 100%)"], ...STAGES.map(st => [String(st), `Foto ${stageName(st)}`])];
  sel.innerHTML = `<optgroup label="Satu video utuh dari rekaman">${rvOpts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</optgroup>`
    + `<optgroup label="Dari foto">${phOpts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</optgroup>`;
  if (!prev && rvSts.length) sel.value = "rv:all";
  if (prev) sel.value = prev;
  updateEstimate();
}
$("vidList").addEventListener("change", e => {
  const mx = e.target.closest("[data-vmix]"); if (!mx) return;
  const v = videos.get(mx.dataset.vmix); if (!v) return;
  v.mix = mx.checked; persistVid(mx.dataset.vmix); updateEstimate();
});
$("vidList").addEventListener("click", e => {
  const rn = e.target.closest("[data-vren]"), rs = e.target.closest("[data-vrensave]");
  if (rn) {
    const k = rn.dataset.vren, v = videos.get(k), item = rn.closest(".viditem");
    item.querySelectorAll(".vren").forEach(x => x.remove());
    const box = document.createElement("div"); box.className = "vren";
    box.innerHTML = `<input type="text" list="vidTitleList" value="${esc(v.title || "")}" aria-label="Judul video"><button class="btn primary" type="button" data-vrensave="${esc(k)}">Simpan judul</button>`;
    item.querySelector(".acts").before(box); box.querySelector("input").focus(); box.querySelector("input").select();
    return;
  }
  if (rs) {
    const k = rs.dataset.vrensave, v = videos.get(k), t = rs.previousElementSibling.value.trim();
    if (!t) return toast("Judul tidak boleh kosong.");
    if (t !== v.title) { v.title = t; if (v.gid) v.metaDirty = true; persistVid(k); cloudSoon(1500); }
    render(); toast(`Judul diganti: "${t}".`); return;
  }
  const sh = e.target.closest("[data-vshare]"), dl = e.target.closest("[data-vdl]"), del = e.target.closest("[data-vdel]");
  if (sh) {
    const k = sh.dataset.vshare, v = videos.get(k), polos = sh.dataset.ver === "polos" && v.plain;
    const f = new File([polos ? v.plain : v.blob], polos ? vidName(k).replace(/(\.\w+)$/, " - polos$1") : vidName(k), { type: v.mime || v.blob.type, lastModified: v.t });
    if (!navigator.canShare || !navigator.canShare({ files: [f] })) return toast("HP/browser ini belum mendukung kirim langsung. Ketuk Unduh, lalu unggah lewat aplikasi Drive.");
    navigator.share({ files: [f], title: v.title }).then(() => { if (polos) v.upPlain = Date.now(); else v.up = Date.now(); persistVid(k); render(); toast("Video dibagikan. Periksa di Google Drive."); })
      .catch(er => { if (er && er.name !== "AbortError") toast("Gagal membuka menu Bagikan: " + er.message); });
  }
  if (dl) { const k = dl.dataset.vdl, v = videos.get(k);
    saveToGallery(vidItems(k, vidName(k)), "Simpan video"); }
  if (del) {
    if (!del.dataset.armed) { del.dataset.armed = 1; del.textContent = "Yakin hapus?"; setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = "Hapus"; } }, 3000); return; }
    const k = del.dataset.vdel, v = videos.get(k); if (v && v.url) URL.revokeObjectURL(v.url);
    cloudForget(v); videos.delete(k); dbPut(k, null); render(); toast("Video dihapus.");
  }
});

// Rekam video di lokasi
$("vidRec").addEventListener("click", () => {
  const title = $("vidTitle").value.trim() || `Keliling bangunan – ${stageName(0).toLowerCase()}`;
  if (!profil.nama) { toast("Isi nama sekolah dan NPSN dulu."); return; }
  refreshGps();
  KKAVid.openRecorder({
    title, stampMode: vidStamp, horizon: vidHorizon, quality: vidQuality, audio: vidAudio, idLine: `${profil.nama || "-"} · NPSN ${profil.npsn || "-"}`, zone: zoneLabel, gps: currentGps, tag: "VIDEO DOKUMENTASI",
    address: vidAddress,
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

// Unggah video dari galeri HP (satu atau beberapa), diberi judul dari kolom Judul video
$("vidGalBtn").addEventListener("click", () => { $("vidGal").value = ""; $("vidGal").click(); });
$("vidGal").addEventListener("change", async e => {
  const files = [...(e.target.files || [])]; e.target.value = "";
  if (!files.length) return;
  const title = $("vidTitle").value.trim() || "Video dari galeri";
  let ok = 0, bad = 0;
  for (const [i, file] of files.entries()) {
    toast(`Memeriksa video ${i + 1}/${files.length}…`);
    const m = await videoMeta(file);
    if (!m) { bad++; continue; }
    const isMov = /quicktime|\.mov$/i.test(file.type + " " + file.name);
    let ext = (file.name.split(".").pop() || "mp4").toLowerCase(), mime = file.type || "video/mp4", blob;
    try { blob = new Blob([await file.arrayBuffer()], { type: mime }); } catch (er) { bad++; continue; } // salin isinya: file galeri hanya "dipinjam"
    if (isMov) { const b = await movToMp4(blob); if (b) { blob = b; mime = "video/mp4"; ext = "mp4"; } else { ext = "mov"; mime = "video/quicktime"; } }
    else if (!/^(mp4|webm|3gp|mkv)$/.test(ext)) ext = /webm/.test(mime) ? "webm" : "mp4";
    const k = saveVideo({ blob, mime, ext, dur: m.dur || 0, t: takenTime(file), title: files.length > 1 ? `${title} (${i + 1})` : title, nostamp: true, fromGal: true },
      `Video dari galeri tersimpan (${fmtDur(m.dur || 0)}, ${(blob.size / 1048576).toFixed(1)} MB).`);
    videos.get(k).gal = Date.now(); persistVid(k); // sudah ada di galeri: tidak disimpan dua kali
    ok++;
  }
  render();
  toast(`${ok} video dari galeri ditambahkan dengan judul "${title}".${bad ? ` ${bad} video tidak bisa dibaca (di iPhone pilih format "Paling Kompatibel").` : ""} Ketuk ✏️ Judul untuk mengganti.`);
});
// Video gabungan dari video bebas/galeri: yang dicentang "Masuk video gabungan" (bawaan: semua kecuali hasil gabungan/laporan)
const isReportVid = v => v.report || /^Video (utuh|laporan|gabungan)/.test(v.title || "");
const mixOn = v => (v.mix !== undefined ? v.mix : !isReportVid(v));
const mixKeys = () => [...videos.entries()].filter(([, v]) => !v.room && mixOn(v))
  .sort((a, b) => a[1].t - b[1].t || (a[1].title || "").localeCompare(b[1].title || "", "id", { numeric: true })).map(([k]) => k);

// Video laporan otomatis dari foto
function reportScenes(scope, sec) {
  const sc = [];
  const school = profil.nama || "Sekolah";
  const head = (kicker, title, lines, d = 3) => sc.push({ type: "title", kicker, title, lines, sec: d });
  const badgeColor = st => (st === 0 ? "#f0a050" : st === 100 ? "#4cc27e" : "#f2b705");
  if (scope.startsWith("rv")) { // gabungan video per ruangan → satu video utuh (untuk media sosial)
    const all = scope === "rv:all", stages = all ? STAGES : [+scope.split(":")[1]];
    const clipSec = $("mkClip").value;
    head("DOKUMENTASI REVITALISASI SD 2026", school, [idLine().replace(school + "  ·  ", ""),
      all ? "Perjalanan pembangunan per ruangan: 0% → 100%" : `Video per ruangan · ${stageName(stages[0])}`]);
    for (const p of paket) {
      const groups = stages.map(st => [st, roomClips(p.id, st)]).filter(([, c]) => c.some(([, v]) => !v.skip));
      if (!groups.length) continue;
      head(p.grup.toUpperCase(), p.nama, [all ? `Tahap: ${groups.map(([st]) => pn(st) + "%").join(" → ")}` : stageName(stages[0])], 2);
      for (const [st, clips] of groups) clips.filter(([, v]) => !v.skip).forEach(([, v], i) => {
        const d = Math.max(1, v.dur || RV_MAX_SEC), sec = clipSec === "full" ? d : Math.min(d, +clipSec);
        const sh = shotOf(p, v);
        sc.push({ type: "clip", blob: ($("mkVer").value === "polos" && v.plain) || v.blob, sec,
          start: clipSec === "full" ? 0 : Math.min(1, Math.max(0, d - sec)), // lewati 1 detik pertama yang sering goyang
          badge: st === 0 ? "0% · KONDISI AWAL" : st === 100 ? "100% · SELESAI" : `PROGRES ${pn(st)}%`, badgeColor: badgeColor(st),
          label: `${p.nama}${sh ? " · " + sh.t : ""} · ${tgl(v.t)}` });
      });
    }
  } else if (scope === "vb") { // gabungan video bebas & video dari galeri, urut waktu
    const clipSec = $("mkClip").value, list = mixKeys();
    head("DOKUMENTASI REVITALISASI SD 2026", $("mkTitle").value.trim() || school, [idLine().replace(school + "  ·  ", ""), `${list.length} video`]);
    for (const k of list) {
      const v = videos.get(k), d = Math.max(1, v.dur || RV_MAX_SEC), sec = clipSec === "full" ? d : Math.min(d, +clipSec);
      sc.push({ type: "clip", blob: ($("mkVer").value === "polos" && v.plain) || v.blob, sec,
        start: clipSec === "full" ? 0 : Math.min(1, Math.max(0, d - sec)), label: `${v.title || "Video"} · ${tgl(v.t)}` });
    }
  } else if (scope === "keg") { // foto kegiatan per judul (dipilih), bisa diselingi video pilihan, urut waktu
    const pick = new Set([...$("mkKeg").querySelectorAll("input:checked")].map(i => i.value));
    const polos = $("mkVer").value === "polos", clipSec = $("mkClip").value;
    const items = kegKeys().filter(k => pick.has(kegFolder(photos.get(k)))).map(k => ({ k, t: photos.get(k).t, ph: photos.get(k) }));
    if ($("mkKegVid").checked) mixKeys().forEach(k => items.push({ k, t: videos.get(k).t, v: videos.get(k) }));
    items.sort((a, b) => a.t - b.t);
    const nPh = items.filter(i => i.ph).length, nV = items.length - nPh;
    head("DOKUMENTASI KEGIATAN · REVITALISASI SD 2026", $("mkTitle").value.trim() || school,
      [idLine().replace(school + "  ·  ", ""), `${nPh} foto kegiatan${nV ? ` · ${nV} video` : ""}`]);
    let lastF = null;
    for (const it of items) {
      if (it.ph) {
        const f = kegFolder(it.ph);
        if (f !== lastF) { head(tgl(it.t), it.ph.cap || f, [], 2); lastF = f; }
        sc.push({ type: "photo", blob: (polos && it.ph.orig && !it.ph.raw ? it.ph.orig : it.ph.blob), badge: "KEGIATAN", label: `${it.ph.cap || ""} · ${tgl(it.t)}`, sec });
      } else {
        const v = it.v, d = Math.max(1, v.dur || RV_MAX_SEC), s2 = clipSec === "full" ? d : Math.min(d, +clipSec); lastF = null;
        sc.push({ type: "clip", blob: (polos && v.plain) || v.blob, sec: s2, start: clipSec === "full" ? 0 : Math.min(1, Math.max(0, d - s2)), label: `${v.title || "Video"} · ${tgl(v.t)}` });
      }
    }
  } else {
    const stages = scope === "cmp" ? STAGES : [+scope];
    head("DOKUMENTASI REVITALISASI SD 2026", school, [idLine().replace(school + "  ·  ", ""),
      scope === "cmp" ? "Perbandingan kondisi per ruang: 0% → 100%" : stageName(+scope)]);
    for (const p of paket) {
      const rows = [];
      for (const a of ALL_ANGLES) {
        const shots = stages.map(st => [st, photos.get(KEY(p.id, a.k, st))]).filter(([, ph]) => ph);
        if (shots.length) rows.push([angleOf(a.k, shots[shots.length - 1][0]), shots]);
      }
      if (!rows.length) continue;
      const used = [...new Set(rows.flatMap(([, sh]) => sh.map(([st]) => pn(st) + "%")))];
      head(p.grup.toUpperCase(), p.nama, [`Tahap: ${used.join(" → ")}`], 2);
      for (const [a, shots] of rows) for (const [st, ph] of shots)
        sc.push({ type: "photo", blob: ph.blob, badge: st === 0 ? "0% · KONDISI AWAL" : st === 100 ? "100% · SELESAI" : `PROGRES ${pn(st)}%`, badgeColor: badgeColor(st), label: `${p.nama} · ${a.l}`, sec });
    }
  }
  head("REVITALISASI SD 2026", school, ["Video dibuat " + new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })], 3);
  return sc;
}
function updateEstimate() {
  const sc = reportScenes($("mkScope").value || "cmp", +$("mkSec").value);
  const scp = $("mkScope").value || "", keg = scp === "keg", kv = keg && $("mkKegVid").checked;
  const clip = /^(rv|vb)/.test(scp);
  $("mkSecWrap").hidden = clip; $("mkClipWrap").hidden = !clip && !kv; $("mkVerWrap").hidden = !clip && !keg;
  $("mkTitleWrap").hidden = scp !== "vb" && !keg; $("mkKegWrap").hidden = !keg;
  const n = sc.filter(s => s.type === "clip" || s.type === "photo").length, dur = sc.reduce((a, s) => a + s.sec, 0);
  $("mkEst").textContent = n ? `${keg ? `${sc.filter(s => s.type === "photo").length} foto${kv ? ` + ${sc.filter(s => s.type === "clip").length} video` : ""}` : `${n} ${clip ? "video" : "foto"}`} · durasi video ±${fmtDur(dur)}. Pembuatan butuh waktu sama dengan durasinya; biarkan layar menyala.`
    : keg ? "Centang minimal satu judul kegiatan."
    : $("mkScope").value === "vb" ? "Belum ada video yang dicentang \"Masuk video gabungan\" di daftar Video tersimpan."
    : clip ? "Belum ada video ruangan untuk pilihan ini. Rekam dulu di kartu Video per ruangan." : "Belum ada foto untuk pilihan ini.";
  $("mkBtn").disabled = !n;
}
// Dari layar Kegiatan langsung ke pembuat video dengan isi "Foto kegiatan"
// only: daftar judul yang dicentang (tombol per judul), atau semua judul
function kegToVideo(only) {
  if (!kegKeys().length) return toast("Belum ada foto kegiatan.");
  goScreen("video");
  $("mkScope").value = "keg";
  if (only) {
    $("mkKeg").querySelectorAll("input").forEach(i => (i.checked = only.includes(i.value)));
    $("mkTitle").value = only.length === 1 ? only[0] : "";
  } else $("mkKeg").querySelectorAll("input").forEach(i => (i.checked = true));
  updateEstimate();
  setTimeout(() => { $("mkScope").closest(".card-s").scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
  toast(only && only.length === 1 ? `Video dari foto "${only[0]}". Pilih format (tegak untuk TikTok/Reels/Status WA), lalu ketuk Buat video.`
    : "Isi video: Foto kegiatan. Centang judul yang mau dipakai, lalu ketuk Buat video.");
}
$("kegToVid").addEventListener("click", () => kegToVideo(null));
$("mkFmt").addEventListener("change", () => { try { localStorage.setItem("kka-mkfmt", $("mkFmt").value); } catch (e) {} });
$("mkScope").addEventListener("change", () => { if ($("mkScope").value === "vb") $("mkClip").value = "full"; updateEstimate(); });
$("mkTitle").addEventListener("input", () => {});
$("mkSec").addEventListener("change", updateEstimate);
$("mkClip").addEventListener("change", updateEstimate);
$("mkVer").addEventListener("change", updateEstimate);
$("mkKegVid").addEventListener("change", updateEstimate);
$("mkKeg").addEventListener("change", updateEstimate);
$("mkBtn").addEventListener("click", async () => {
  const scope0 = $("mkScope").value;
  if (scope0.startsWith("rv")) { // klip dari HP lain diambil dulu dari Drive
    const sts = scope0 === "rv:all" ? STAGES : [+scope0.split(":")[1]];
    const need = [...videos.entries()].filter(([, v]) => v.room && sts.includes(v.st) && !v.skip).map(([k]) => k);
    if (!(await fetchVids(need, "Video ruangan siap. Membuat video utuh…"))) return;
  }
  if ((scope0 === "vb" || (scope0 === "keg" && $("mkKegVid").checked)) && !(await fetchVids(mixKeys(), "Video siap. Membuat video gabungan…"))) return;
  const scope = $("mkScope").value, sc = reportScenes(scope, +$("mkSec").value);
  const label = scope === "rv:all" ? "Video utuh – perjalanan 0% → 100% (medsos)" : scope.startsWith("rv:") ? `Video utuh – ruangan ${stageName(+scope.split(":")[1]).toLowerCase()} (medsos)`
    : scope === "vb" ? `Video gabungan – ${$("mkTitle").value.trim() || "video pilihan"}`
    : scope === "cmp" ? "Video laporan – perbandingan 0% → 100%" : scope === "keg" ? `Video gabungan – kegiatan${$("mkTitle").value.trim() ? " – " + $("mkTitle").value.trim() : ""}` : `Video laporan – ${stageName(+scope).toLowerCase()}`;
  const portrait = $("mkFmt").value === "port";
  KKAVid.makeReport(sc, { portrait, onSaved: v => saveVideo({ ...v, title: label + (portrait ? " (tegak 9:16)" : ""), report: true }), onError: m => toast(m) });
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
/* Tambahan: lokasi HP yang berjarak > 3 km dari koordinat sekolah dianggap salah (mis. terbaca di Sarawak
   karena lokasi perkiraan jaringan), dan lokasi perkiraan (akurasi ≥ 500 m) tidak pernah dicetak. */
const farFromSchool = g => { const sk = schoolKoor(); return sk && g ? KKA.distanceM(g, sk) : 0; };
function currentGps() {
  const live = fix && Date.now() - fix.t < 300000 ? fix : null;
  const far = live ? farFromSchool(live) : 0;
  if (live && live.acc <= KKA.LIMIT.gpsAcc && far <= KKA.LIMIT.schoolFar) return { ...live, src: "gps" };
  const sk = schoolKoor();
  if (sk) return { lat: sk.lat, lng: sk.lng, acc: null, phoneAcc: live ? live.acc : null, phoneFar: live ? Math.round(far) : null, src: "sekolah" };
  if (live && live.acc >= KKA.LIMIT.approx) return null; // lokasi perkiraan: lebih baik tidak dicetak
  return live ? { ...live, src: "gps" } : null;
}

/* opts.cover = true: gambar sumber sudah bercap (foto lama), jadi cap lama ditutup penuh dulu.
   Selain itu, salinan foto TANPA cap ikut disimpan (orig) agar cap bisa dicetak ulang dengan bersih. */
/* Penanda tersembunyi (komentar JPEG) pada foto yang dicap aplikasi ini, agar bila diunggah ulang dari galeri
   aplikasi tahu foto itu sudah ber-stamp dan tidak menempel cap kedua. */
const STAMP_MARK = "KameraRevitSD:stamped";
async function tagJpeg(blob) {
  try {
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    if (head[0] !== 0xFF || head[1] !== 0xD8) return blob;
    const txt = new TextEncoder().encode(STAMP_MARK), seg = new Uint8Array(4 + txt.length);
    seg.set([0xFF, 0xFE, (txt.length + 2) >> 8, (txt.length + 2) & 255]); seg.set(txt, 4);
    return new Blob([blob.slice(0, 2), seg, blob.slice(2)], { type: "image/jpeg" });
  } catch (e) { return blob; }
}
// Aplikasi kamera ber-stamp yang dikenali dari data EXIF fotonya
const STAMP_APPS = /gps\s*map\s*camera|timestamp\s*camera|geotag|gps\s*camera|map\s*camera|kamera\s*gps|solocator|note\s*cam|open\s*camera.*stamp/i;
/* Deteksi stamp dari gambarnya langsung (GPS Map Camera, Timemark, dll.):
   stamp = beberapa baris tulisan terang di atas kotak gelap, rata kiri/kanan, di separuh bawah foto.
   Dicari baris-baris tulisan (banyak tepi terang→gelap dalam satu baris piksel) yang ujung kiri
   atau kanannya sejajar. Tekstur alami (rumput, papan) ditolak bila pola serupa juga ada di separuh atas. */
function textLines(lum, W, y0, y1) {
  const n = y1 - y0, H = lum.length / W;
  const e = new Uint8Array(W * n), tr = new Uint8Array(n);
  for (let y = 0; y < n; y++) {
    const o = (y0 + y) * W; let cnt = 0, dk = 0;
    for (let x = 0; x < W; x++) {
      const v = lum[o + x];
      if (v < 100) dk++;
      if (v >= 160) {
        let hit = false;
        for (let d = 1; d <= 2 && !hit; d++) {
          if (x - d >= 0 && lum[o + x - d] <= v - 70) hit = true;
          else if (x + d < W && lum[o + x + d] <= v - 70) hit = true;
        }
        if (hit) { e[y * W + x] = 1; cnt++; }
      }
    }
    tr[y] = cnt >= Math.max(4, W * 0.012) && dk > 0.3 * W ? 1 : 0;
  }
  const lines = [];
  for (let y = 0; y < n; y++) {
    if (!tr[y]) continue;
    const s = y;
    while (y < n && (tr[y] || (y + 1 < n && tr[y + 1]))) y++;
    const h = y - s;
    if (h < H * 0.005 || h > H * 0.07) continue;
    // kolom yang berisi tepi tulisan → ambil potongan bersambung terpanjang (jeda antarkata kecil)
    let best = null, a0 = -1, pv = -1, gap = W * 0.025, cols = 0;
    for (let x = 0; x < W; x++) {
      let any = 0; for (let yy = s; yy < y; yy++) if (e[yy * W + x]) { any = 1; break; }
      if (!any) continue; cols++;
      if (a0 < 0) a0 = x; else if (x - pv > gap) { if (!best || pv - a0 > best[1] - best[0]) best = [a0, pv]; a0 = x; }
      pv = x;
    }
    if (a0 >= 0 && (!best || pv - a0 > best[1] - best[0])) best = [a0, pv];
    if (cols >= 4 && best && best[1] - best[0] >= W * 0.12) lines.push([s, y, best[0], best[1]]);
  }
  let top = 0;
  for (const side of [2, 3]) for (const L of lines) {
    const g = lines.filter(M => Math.abs(M[side] - L[side]) <= W * 0.02);
    let ok = 1; for (let i = 1; i < g.length; i++) if (g[i][0] - g[i - 1][1] <= H * 0.06) ok++;
    top = Math.max(top, ok);
  }
  return top;
}
function looksStamped(img) {
  try {
    // perkecil bertahap (½ tiap langkah) agar tulisan kecil tetap terbaca, sampai lebar ≤ 1000 px
    let src = img, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    while (w > 2000) {
      const c = document.createElement("canvas"); c.width = Math.round(w / 2); c.height = Math.round(h / 2);
      c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); src = c; w = c.width; h = c.height;
    }
    const W = Math.min(1000, w), H = Math.round(h * W / w);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, lum = new Uint8Array(W * H);
    for (let i = 0, j = 0; j < lum.length; i += 4, j++) {
      const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const L = (r * 299 + g * 587 + b * 114) / 1000;
      lum[j] = L >= 160 && mx - mn >= 70 ? 159 : L; // tulisan stamp putih/abu, bukan warna mencolok
    }
    const bot = textLines(lum, W, Math.floor(H * 0.5), H), top = textLines(lum, W, 0, Math.floor(H * 0.5));
    return bot >= 4 && top <= 2;
  } catch (e) { return false; }
}
async function hasOwnStamp(file) {
  try { return new TextDecoder("latin1").decode(await file.slice(0, 65536).arrayBuffer()).includes(STAMP_MARK); } catch (e) { return false; }
}
async function stamp(img, takenAt, gps, p, a, opts = {}) {
  const res = await stampInner(img, takenAt, gps, p, a, opts);
  res.blob = await tagJpeg(res.blob);
  return res;
}
async function stampInner(img, takenAt, gps, p, a, opts = {}) {
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
    const res = { blob, t: when0.getTime(), lat: gps.lat, lng: gps.lng, acc: gps.acc, sv: "lengkap2" };
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
    : gps.src === "foto" ? `GPS foto ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`
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
  const res = { blob, t: when.getTime(), lat: gps ? gps.lat : null, lng: gps ? gps.lng : null, acc: gps ? gps.acc : null, sv: "ringkas" };
  if (orig) res.orig = orig;
  return res;
}

// Judul & label cap untuk sebuah kunci foto
function stampCtx(k, cap, away) {
  const q = parseKey(k);
  if (away === undefined) away = !!(photos.get(k) || {}).away;
  if (q.keg) return { p: { nama: cap || "Kegiatan" }, a: { l: "Kegiatan", k: "keg" }, opts: { title: `KEGIATAN — ${(cap || "").toUpperCase()}`, tag: "DOKUMENTASI KEGIATAN", away } };
  return { p: paket.find(x => x.id === q.pid), a: angleOf(q.ak, q.st), opts: { tag: stageTag(q.st) } };
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
async function addressFor(gps, away) {
  if (!away && profil.alamat && profil.alamat.trim()) return { text: profil.alamat.trim(), exact: true };
  if (!gps) return { text: "", exact: false };
  const found = await Promise.race([KKAGeo.reverse(gps.lat, gps.lng), new Promise(r => setTimeout(() => r(null), 3500))]);
  return found ? { text: found, exact: true } : { text: profil.wil || "", exact: false };
}
/* Cap gaya kamera GPS: kotak peta (satelit/jalan) terpisah + kartu teks:
   judul kecamatan/provinsi + bendera, Plus Code & alamat, Lat/Long, tanggal (AM/PM GMT), Note (sudut, ruang, tahap, sekolah). */
const niceTag = t => String(t || "").toLowerCase().replace(/(^|\s|\()\S/g, c => c.toUpperCase()).replace(/Sd\b/g, "SD");
async function stampFull(x, W, H, when, gps, p, a, opts) {
  const ad = await addressFor(gps, opts.away);
  const what = opts.title ? niceTag(opts.title) : `${a.l} — ${p.nama}`;
  const note = `${what} · ${niceTag(opts.tag || "KONDISI AWAL 0%")} · ${profil.nama || "-"} (NPSN ${profil.npsn || "-"})`;
  await KKAGeo.drawCard(x, W, H, { lat: gps.lat, lng: gps.lng, acc: gps.acc, src: gps.src, addr: ad.exact ? ad.text : "",
    fallbackHead: ad.text || "Indonesia", when, note, app: "Kamera Revit SD", cover: opts.cover });
}

// ---------- Cetak ulang cap untuk foto tanpa koordinat ----------
const noKoorKeys = () => [...photos.entries()]
  .filter(([k, ph]) => ph.lat == null && !ph.raw && (k.startsWith("#keg|") || inPaket(k))).map(([k]) => k);
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
$("pKoor").addEventListener("input", () => { renderFix(); renderWrongLoc(); renderKoorWarn(); });
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
      photos.set(k, { ...ph, gal: undefined, blob: res.blob, sv: res.sv, lat: sk.lat, lng: sk.lng, acc: null, warn,
        synced: false, gs: false, prevPath: ph.synced ? ph.path : ph.prevPath, url: URL.createObjectURL(res.blob) });
      persist(k); ok++;
    } catch (e) {}
  }
  render(); toast(`${ok} foto diperbarui dengan koordinat sekolah.`); cloudSoon(1500);
});

// ---------- Perbaiki foto yang lokasinya salah (mis. terbaca di Malaysia) ----------
/* Foto dianggap salah lokasi bila berjarak > 3 km dari koordinat sekolah (termasuk foto yang dicap dengan
   koordinat sekolah lama yang keliru), atau lokasinya dari HP dengan akurasi perkiraan (≥ 500 m).
   Pemeriksaan jarak tidak dilakukan selama koordinat sekolah sendiri dicurigai salah. */
const wrongLocKeys = () => {
  const sk = koorSuspect() ? null : schoolKoor();
  return [...photos.entries()].filter(([k, ph]) => (k.startsWith("#keg|") || inPaket(k)) && ph.lat != null && !ph.away && !ph.raw &&
    ((sk && KKA.distanceM({ lat: ph.lat, lng: ph.lng }, sk) > KKA.LIMIT.schoolFar) || (ph.acc != null && ph.acc >= KKA.LIMIT.approx))).map(([k]) => k);
};
function renderWrongLoc() {
  const keys = wrongLocKeys(), n = keys.length, sk = schoolKoor();
  $("locBox").hidden = !n || screen === "atur";
  if (!n) return;
  let maxKm = 0;
  if (sk) keys.forEach(k => { const ph = photos.get(k); maxKm = Math.max(maxKm, KKA.distanceM(ph, sk) / 1000); });
  $("locText").textContent = sk
    ? `${n} foto tercatat di lokasi yang salah${maxKm > 3 ? ` (sampai ${maxKm.toFixed(0)} km dari sekolah)` : " (lokasi perkiraan)"}. Perbaiki dengan koordinat sekolah? Tanggal & jam asli tidak berubah.`
    : `${n} foto memakai lokasi perkiraan yang tidak akurat. Isi "Koordinat sekolah" dulu, lalu perbaiki lokasinya.`;
  $("locBtn").hidden = !sk; $("locFill").hidden = !!sk;
  $("locBtn").textContent = `Perbaiki lokasi ${n} foto`; $("locBtn").disabled = restamping;
}
$("locFill").addEventListener("click", () => goScreen("atur", "pKoor"));
$("locBtn").addEventListener("click", async e => {
  const sk = koorSuspect() ? null : schoolKoor(), keys = wrongLocKeys(); if (!sk || !keys.length || restamping) return;
  const btn = e.currentTarget; restamping = true; let ok = 0, i = 0;
  for (const k of keys) {
    i++; btn.textContent = `Memperbaiki ${i}/${keys.length}…`;
    const ph = photos.get(k), c = stampCtx(k, ph.cap);
    try {
      const img = await createImageBitmap(ph.orig || ph.blob);
      const res = await stamp(img, ph.t, { ...sk, acc: null, src: "sekolah" }, c.p, c.a, { ...c.opts, cover: !ph.orig });
      URL.revokeObjectURL(ph.url);
      const warn = (ph.warn || []).filter(w => !/GPS|koordinat|Lokasi/i.test(w)).concat(ph.acc == null ? "Lokasi diperbaiki dengan koordinat sekolah yang benar." : "Lokasi HP saat memotret tidak akurat; diperbaiki dengan koordinat sekolah.");
      photos.set(k, { ...ph, gal: undefined, blob: res.blob, sv: res.sv, lat: sk.lat, lng: sk.lng, acc: null, warn, up: undefined,
        synced: false, gs: false, prevPath: ph.synced ? ph.path : ph.prevPath, url: URL.createObjectURL(res.blob) });
      persist(k); ok++;
    } catch (er) {}
  }
  restamping = false; render();
  toast(`${ok} foto diperbaiki lokasinya. Unggah ulang ke Drive bila sebelumnya sudah terkirim.`); cloudSoon(1500);
});

// ---------- Perbarui cap foto lama ke gaya yang dipilih ----------
/* Foto dianggap "cap lama" bila gaya capnya berbeda dari pilihan sekarang (foto versi lama tidak punya tanda gaya).
   Cetak ulang memakai salinan tanpa cap (bersih) bila ada; bila tidak, cap lama ditutup lalu dicetak cap baru.
   Tanggal/jam & koordinat asli foto tetap dipakai. */
const curStyle = () => ((profil.gaya || "lengkap") === "lengkap" ? "lengkap2" : "ringkas"); // lengkap2 = gaya kamera GPS (v1.9)
const oldStampKeys = () => [...photos.entries()]
  .filter(([k, ph]) => (k.startsWith("#keg|") || inPaket(k)) && !ph.raw && ph.sv !== curStyle() && (ph.lat != null || schoolKoor())).map(([k]) => k);
function renderOldStamp() {
  const keys = oldStampKeys(), n = keys.length;
  const clean = keys.filter(k => photos.get(k).orig).length;
  $("oldBox").hidden = n === 0 || screen === "atur";
  $("oldInfo").textContent = n
    ? `${n} foto masih memakai cap lama.` + (n - clean ? ` ${clean} bisa dicetak ulang bersih; ${n - clean} foto dari versi awal akan ditutup cap lamanya dengan latar gelap.` : "")
    : "Semua foto sudah memakai cap terbaru.";
  $("oldText").textContent = `${n} foto masih memakai cap lama. Perbarui ke cap ${curStyle() === "lengkap2" ? "baru (peta & alamat seperti kamera GPS)" : "ringkas"}? Tanggal & jam asli tidak berubah.`;
  for (const id of ["oldBtn", "oldBtn2"]) { $(id).textContent = `Perbarui cap ${n} foto`; $(id).disabled = !n || restamping; }
}
let restamping = false;
async function restampOld(btn) {
  const keys = oldStampKeys(); if (!keys.length || restamping) return;
  restamping = true; let ok = 0, i = 0;
  for (const k of keys) {
    i++; btn.textContent = `Memperbarui ${i}/${keys.length}…`;
    const ph = photos.get(k), c = stampCtx(k, ph.cap);
    const sk = schoolKoor();
    const gps = ph.lat != null ? { lat: ph.lat, lng: ph.lng, acc: ph.acc ?? null, src: ph.acc == null ? (ph.away ? "foto" : "sekolah") : "gps" }
      : ph.away ? null : { ...sk, acc: null, src: "sekolah" };
    try {
      const img = await createImageBitmap(ph.orig || ph.blob);
      const res = await stamp(img, ph.t, gps, c.p, c.a, { ...c.opts, cover: !ph.orig });
      URL.revokeObjectURL(ph.url);
      photos.set(k, { ...ph, gal: undefined, blob: res.blob, sv: res.sv, lat: gps.lat, lng: gps.lng, acc: gps.acc, up: undefined,
        synced: false, gs: false, prevPath: ph.synced ? ph.path : ph.prevPath, url: URL.createObjectURL(res.blob) });
      persist(k); ok++;
    } catch (e) {}
  }
  restamping = false; render();
  toast(`${ok} foto diperbarui ke cap terbaru. Unggah ulang ke Drive bila sebelumnya sudah terkirim.`); cloudSoon(1500);
}
/* Ubah judul kegiatan untuk satu kelompok foto: keterangan, cap (dicetak ulang dari foto asli), nama file,
   dan folder Drive (Kegiatan/<judul baru>) ikut berubah. Tanggal & lokasi foto tidak berubah. */
async function retitleKeg(oldF, newCap, btn, days) {
  if (!newCap) return toast("Judul tidak boleh kosong.");
  const keys = kegKeys().filter(k => kegFolder(photos.get(k)) === oldF && (!days || days.includes(tgl(photos.get(k).t))));
  if (!keys.length || restamping) return;
  if (newCap === (photos.get(keys[0]).cap || "")) { render(); return; }
  restamping = true; let ok = 0, i = 0;
  for (const k of keys) {
    i++; if (btn) btn.textContent = `Memperbarui ${i}/${keys.length}…`;
    const ph = photos.get(k), c = stampCtx(k, newCap);
    if (ph.raw) { photos.set(k, { ...ph, cap: newCap, gs: false }); persist(k); ok++; continue; } // foto ber-stamp asli: cap tidak dicetak ulang
    const sk = schoolKoor();
    const gps = ph.lat != null ? { lat: ph.lat, lng: ph.lng, acc: ph.acc ?? null, src: ph.acc == null ? (ph.away ? "foto" : "sekolah") : "gps" }
      : ph.away ? null : sk ? { ...sk, acc: null, src: "sekolah" } : null;
    try {
      const img = await createImageBitmap(ph.orig || ph.blob);
      const res = await stamp(img, ph.t, gps, c.p, c.a, { ...c.opts, cover: !ph.orig });
      URL.revokeObjectURL(ph.url);
      photos.set(k, { ...ph, cap: newCap, gal: undefined, blob: res.blob, sv: res.sv, up: undefined,
        synced: false, gs: false, url: URL.createObjectURL(res.blob) });
      persist(k); ok++;
    } catch (e) {
      photos.set(k, { ...ph, cap: newCap, gs: false }); persist(k); // cap tidak bisa dicetak ulang: judul tetap diganti
    }
  }
  restamping = false; if (!days) $("kegCap").value = newCap; render(); cloudSoon(1500);
  toast(`Judul ${keys.length} foto diganti menjadi "${newCap}"${ok < keys.length ? ` (${keys.length - ok} tanpa cetak ulang cap)` : ""}. Folder Drive ikut berpindah saat sinkron.`);
}
$("oldBtn").addEventListener("click", e => restampOld(e.currentTarget));
$("oldBtn2").addEventListener("click", e => restampOld(e.currentTarget));

// ---------- Ambil → periksa → simpan ----------
let pending = null; // {key, rec, url}
const labelOf = k => {
  const q = parseKey(k);
  if (q.keg) return "Kegiatan " + ((photos.get(k) || {}).cap || pendingCap || "");
  const p = paket.find(x => x.id === q.pid), a = angleOf(q.ak, q.st);
  return p && a ? `${a.l} ${p.nama}${q.st ? " " + pn(q.st) + "%" : ""}` : k;
};
$("picker").addEventListener("change", e => {
  const f = e.target.files && e.target.files[0];
  if (f && target) processFile(f, target, 0);
});
/* ---------- Kegiatan di luar sekolah (mis. pengambilan dana di bank, survei toko material) ----------
   Lokasi HP dipakai apa adanya (tidak diganti koordinat sekolah) dan alamat dicari dari lokasi itu. */
var kegAway = false;
try { kegAway = sessionStorage.getItem("kka-kegaway") === "1"; } catch (e) {}
function setKegAway(v) {
  kegAway = v; try { sessionStorage.setItem("kka-kegaway", v ? "1" : "0"); } catch (e) {}
  $("kegAway").classList.toggle("on", v); $("kegAtSchool").classList.toggle("on", !v); renderKegLoc();
}
$("kegAway").addEventListener("click", () => { setKegAway(true); refreshGps(); toast("Lokasi kegiatan: di luar sekolah. Stamp memakai lokasi & alamat HP saat memotret."); });
$("kegAtSchool").addEventListener("click", () => { setKegAway(false); toast("Lokasi kegiatan: di sekolah."); });
function awayGps() {
  const live = fix && Date.now() - fix.t < 300000 ? fix : null;
  return live && live.acc < KKA.LIMIT.approx ? { ...live, src: "gps" } : null;
}
function renderKegLoc() {
  const live = fix && Date.now() - fix.t < 300000 ? fix : null, far = live ? farFromSchool(live) : 0;
  $("kegLocHint").textContent = kegAway
    ? (live && live.acc < KKA.LIMIT.approx ? `Stamp memakai lokasi HP saat ini (±${live.acc} m) dan alamatnya, bukan alamat sekolah.` : "Menunggu GPS HP… Bila GPS tidak terkunci, koordinat tidak dicetak. Berdirilah di tempat terbuka.")
    : live && live.acc <= KKA.LIMIT.gpsAcc && far > KKA.LIMIT.schoolFar
      ? `📍 HP Anda ${(far / 1000).toFixed(far >= 10000 ? 0 : 1)} km dari sekolah. Bila kegiatan ini memang di luar sekolah, pilih "Di luar sekolah".`
      : "Pilih \"Di luar sekolah\" untuk kegiatan di bank, kantor dinas, toko material, dll.";
  $("kegLocHint").classList.toggle("warnc", !kegAway && live && live.acc <= KKA.LIMIT.gpsAcc && far > KKA.LIMIT.schoolFar);
}
setKegAway(kegAway);

/* ---------- Unggah foto manual dari galeri ----------
   EXIF JPEG: tanggal asli (DateTimeOriginal) & GPS bila ada. HEIC/PNG atau foto tanpa EXIF: tanggal file & koordinat sekolah. */
async function readExif(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer(), dv = new DataView(buf);
    if (dv.getUint16(0) !== 0xFFD8) return null;
    let o = 2;
    while (o + 4 < dv.byteLength) {
      const m = dv.getUint16(o), len = dv.getUint16(o + 2);
      if (m === 0xFFE1 && dv.getUint32(o + 4) === 0x45786966) { // "Exif"
        const t0 = o + 10, le = dv.getUint16(t0) === 0x4949;
        const u16 = x => dv.getUint16(x, le), u32 = x => dv.getUint32(x, le);
        const ifd = off => { const n = u16(t0 + off), e = {}; for (let i = 0; i < n; i++) { const p = t0 + off + 2 + i * 12; e[u16(p)] = { type: u16(p + 2), cnt: u32(p + 4), val: p + 8 }; } return e; };
        const str = en => { const off = en.cnt > 4 ? t0 + u32(en.val) : en.val; let s = ""; for (let i = 0; i < en.cnt - 1; i++) s += String.fromCharCode(dv.getUint8(off + i)); return s; };
        const rat3 = en => { const off = t0 + u32(en.val); const r = i => u32(off + i * 8) / (u32(off + i * 8 + 4) || 1); return r(0) + r(1) / 60 + r(2) / 3600; };
        const out = {}, i0 = ifd(u32(t0 + 4));
        const txt = en => { try { return en && en.type === 2 ? str(en) : ""; } catch (e) { return ""; } };
        out.tags = [i0[0x0131], i0[0x010E], i0[0x010F], i0[0x0110], i0[0x013B]].map(txt).join(" | ");
        if (i0[0x8769]) { const ei = ifd(u32(i0[0x8769].val)), d = ei[0x9003] || ei[0x9004];
          const mm = d && str(d).match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
          if (mm) { const t = new Date(+mm[1], +mm[2] - 1, +mm[3], +mm[4], +mm[5], +mm[6]).getTime(); if (t > Date.UTC(2015, 0, 1) && t <= Date.now() + 6e4) out.t = t; }
          if (ei[0x9286]) { try { const en = ei[0x9286], off = en.cnt > 4 ? t0 + u32(en.val) : en.val; let c = ""; for (let i = 8; i < Math.min(en.cnt, 200); i++) { const ch = dv.getUint8(off + i); if (ch) c += String.fromCharCode(ch); } out.tags += " | " + c; } catch (e) {} } }
        if (i0[0x8825]) { const g = ifd(u32(i0[0x8825].val));
          if (g[2] && g[4]) { let lat = rat3(g[2]), lng = rat3(g[4]);
            if (g[1] && str({ ...g[1], cnt: 2 }) === "S") lat = -lat; if (g[3] && str({ ...g[3], cnt: 2 }) === "W") lng = -lng;
            if (lat || lng) { out.lat = lat; out.lng = lng; } } }
        return out;
      }
      if ((m & 0xFF00) !== 0xFF00) break;
      o += 2 + len;
    }
  } catch (e) {}
  return null;
}
// Lokasi foto galeri: GPS di EXIF bila wajar (≤ 3 km dari sekolah bila koordinat sekolah diisi), selain itu koordinat sekolah
function galGps(ex, away) {
  if (away) return ex && ex.lat != null ? { lat: ex.lat, lng: ex.lng, acc: null, src: "foto" } : null;
  const sk = schoolKoor();
  if (ex && ex.lat != null && (!sk || KKA.distanceM(ex, sk) <= KKA.LIMIT.schoolFar)) return { lat: ex.lat, lng: ex.lng, acc: null, src: "foto" };
  return sk ? { lat: sk.lat, lng: sk.lng, acc: null, src: "sekolah", gal: true } : null;
}
let galTarget = null;
$("galPick").addEventListener("change", e => {
  const f = e.target.files && e.target.files[0]; e.target.value = "";
  if (f && galTarget) processFile(f, galTarget, 0, { exif: null });
});
// Kegiatan: banyak foto sekaligus, langsung disimpan (catatan pemeriksaan tetap dicatat di tiap foto)
$("galMulti").addEventListener("change", async e => {
  const files = [...(e.target.files || [])]; e.target.value = "";
  const cap = pendingCap; if (!files.length || !cap) return;
  let ok = 0, fail = 0, nRaw = 0;
  for (const [i, f] of files.entries()) {
    toast(`Mengimpor foto ${i + 1}/${files.length}…`);
    try {
      const key = "#keg|" + Date.now().toString(36) + i;
      const img = await loadImage(f), info = KKA.analyze(img);
      const ex = await readExif(f), takenAt = ex && ex.t ? ex.t : takenTime(f), gps = galGps(ex, kegAway);
      const capF = H_RE.test(cap) ? withH(cap, takenAt) : cap; // foto galeri dari hari lain: nomor H mengikuti tanggal fotonya
      const c = stampCtx(key, capF, kegAway);
      // otomatis: stamp aplikasi ini, aplikasi kamera ber-stamp (EXIF), atau stamp yang terlihat di gambarnya
      const useRaw = await hasOwnStamp(f) || !!(ex && ex.tags && STAMP_APPS.test(ex.tags)) || looksStamped(img);
      if (useRaw) nRaw++;
      const others = [...photos.entries()].filter(([k]) => k.startsWith("#keg|")).map(([k, ph]) => ({ label: labelOf(k), hash: ph.hash, lat: ph.lat, lng: ph.lng }));
      const checks = KKA.runChecks({ info, takenAt, gps, others, allowPortrait: true });
      const res = useRaw ? await rawRec(f, takenAt, gps, img) : await stamp(img, takenAt, gps, c.p, c.a, c.opts);
      photos.set(key, { ...res, hash: info.hash, warn: checks.filter(x => !x.ok && !/dari galeri/.test(x.text)).map(x => x.text), cap: capF, away: kegAway || undefined, synced: false, gs: false, url: URL.createObjectURL(res.blob) });
      persist(key); ok++;
    } catch (err) { fail++; }
  }
  render(); cloudSoon(1500);
  toast(`${ok} foto kegiatan ditambahkan ke "${cap}"${nRaw ? ` (${nRaw === ok ? "semua" : nRaw} sudah ber-stamp, disimpan apa adanya)` : ""}${fail ? `, ${fail} gagal dibaca (pakai JPG/PNG)` : ""}.`);
});
$("kegGal").addEventListener("click", () => {
  const cap = $("kegCap").value.trim();
  if (!cap) { toast("Isi keterangan kegiatan dulu, mis. \"H2 pembongkaran\"."); $("kegCap").focus(); return; }
  pendingCap = cap; $("galMulti").click();
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
async function processFile(f, key, turn, gal) {
  const q = parseKey(key);
  const cap = q.keg ? pendingCap : "";
  const away = !!(q.keg && kegAway);
  const c = stampCtx(key, cap, away);
  const p = c.p, a = c.a;
  try {
    toast("Memeriksa foto…");
    const img = rotated(await loadImage(f), turn);
    const info = KKA.analyze(img);
    // Dari galeri: tanggal & lokasi diambil dari EXIF foto bila ada (bukan lokasi HP saat ini)
    const ex = gal ? (gal.exif || await readExif(f)) : null;
    const takenAt = ex && ex.t ? ex.t : takenTime(f);
    const gps = gal ? galGps(ex, away) : away ? awayGps() : currentGps();
    // Foto kembar diperiksa dalam paket yang sama (beberapa ruang kelas bisa berada di gedung yang sama)
    // Foto kembar: dibandingkan dengan foto lain di paket & tahap yang sama (foto kegiatan: sesama kegiatan)
    const others = [...photos.entries()]
      .filter(([k]) => { if (k === key) return false; const o = parseKey(k); return q.keg ? o.keg : !o.keg && o.pid === q.pid && o.st === q.st; })
      .map(([k, ph]) => ({ label: labelOf(k), hash: ph.hash, lat: away ? null : ph.lat, lng: away ? null : ph.lng }));
    const checks = KKA.runChecks({ info, takenAt, gps: gps && away ? { ...gps, away: true } : gps, others, allowPortrait: q.keg });
    // Foto galeri yang sudah ber-stamp terdeteksi otomatis: stamp aplikasi ini, aplikasi kamera ber-stamp (EXIF),
    // atau stamp yang terlihat di gambarnya. Tombol di layar tinjau hanya untuk mengoreksi foto ini bila tebakan keliru.
    const own = gal && await hasOwnStamp(f);
    const app = gal && ex && ex.tags && STAMP_APPS.test(ex.tags) ? (ex.tags.match(STAMP_APPS) || [""])[0] : "";
    const seen = gal && !own && !app && gal.raw === undefined && looksStamped(img);
    const useRaw = gal && (own || (gal.raw !== undefined ? gal.raw : (!!app || seen)));
    const res = useRaw ? await rawRec(f, takenAt, gps, img) : await stamp(img, takenAt, gps, p, a, c.opts);
    const warn = checks.filter(c => !c.ok).map(c => c.text);
    if (pending) URL.revokeObjectURL(pending.url);
    pending = { key, rec: { ...res, hash: info.hash, warn, cap: cap || undefined, away: away || undefined }, url: URL.createObjectURL(res.blob), raw: f, turn, gal, info, takenAt, gps, isRaw: !!useRaw };
    showReview(p, a, checks);
    if (own) toast("Foto ini sudah ber-stamp dari Kamera Revit SD — disimpan apa adanya, tanpa cap tambahan.");
    else if (useRaw && gal.raw === undefined) toast(app ? `Foto dari ${app} — sudah ber-stamp, disimpan apa adanya.` : "Foto ini sudah ada stamp-nya — disimpan apa adanya, tanpa stamp tambahan.");
  } catch (err) {
    toast("Foto tidak bisa dibaca. Coba ambil ulang atau pilih format JPG/PNG.");
  }
}
// Foto yang sudah ber-stamp: disimpan apa adanya (tanpa cap baru); tanggal & GPS dari foto/EXIF
/* Isi file disalin ke memori saat itu juga: di Android, file dari galeri hanya "dipinjam" dan bisa
   tidak terbaca lagi setelah pemilih ditutup (foto jadi kosong/rusak). Bila bukan JPEG yang bisa
   dibuka (mis. HEIC), gambar disimpan ulang sebagai JPEG kualitas tinggi tanpa stamp tambahan. */
const canDecode = blob => (window.createImageBitmap ? createImageBitmap(blob).then(b => { b.close && b.close(); return true; }, () => false)
  : new Promise(r => { const i = new Image(), u = URL.createObjectURL(blob); i.onload = () => { URL.revokeObjectURL(u); r(true); }; i.onerror = () => { URL.revokeObjectURL(u); r(false); }; i.src = u; }));
async function rawRec(file, takenAt, gps, img) {
  let blob = null;
  try {
    const buf = await file.arrayBuffer(), h = new Uint8Array(buf, 0, 3);
    if (h[0] === 0xFF && h[1] === 0xD8 && h[2] === 0xFF) blob = new Blob([buf], { type: "image/jpeg" });
  } catch (e) {}
  if (blob && !(await canDecode(blob))) blob = null;
  if (!blob && img) {
    const sc = Math.min(1, 4096 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
  }
  if (!blob || !blob.size) throw new Error("foto tidak terbaca");
  return { blob, t: takenAt, lat: gps ? gps.lat : null, lng: gps ? gps.lng : null, acc: gps ? gps.acc ?? null : null, sv: "asli", raw: true };
}
// Layar tinjau (foto galeri): pilih "sudah ada stamp" ↔ "tambahkan stamp"
$("rRawBtn").addEventListener("click", async () => {
  if (!pending || !pending.gal) return;
  const { raw, key, turn, gal, isRaw } = pending;
  URL.revokeObjectURL(pending.url); pending = null;
  processFile(raw, key, turn, { ...gal, raw: !isRaw });
});
// Bila foto terlanjur menyamping, putar 90° lalu periksa ulang
$("rRotate").addEventListener("click", () => {
  if (!pending) return;
  const { raw, key, turn, gal } = pending;
  URL.revokeObjectURL(pending.url); pending = null;
  processFile(raw, key, ((turn || 0) + 90) % 360, gal);
});
function showReview(p, a, checks) {
  const nWarn = checks.filter(c => !c.ok).length;
  const blocked = checks.some(c => c.block);
  pending.blocked = blocked;
  const q = parseKey(pending.key);
  $("rTitle").textContent = q.keg ? `Kegiatan — ${p.nama}` : `${a.l} — ${p.nama}${q.st ? " · " + pn(q.st) + "%" : ""}`;
  $("rImg").src = pending.url;
  $("rRawBtn").hidden = !pending.gal;
  $("rRawBtn").textContent = pending.isRaw ? "🏷️ Tambahkan stamp" : "🏷️ Foto sudah ada stamp (simpan apa adanya)";
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
  photos.set(key, { ...rec, up: undefined, synced: false, gs: false, gid: old ? old.gid : undefined, gidP: old ? old.gidP : undefined, path: null, prevPath, url });
  pending = null;
  $("review").hidden = true;
  persist(key); render();
  toast(`${labelOf(key)} tersimpan${rec.orig && !rec.raw ? " — 2 versi: dengan & tanpa stamp" : ""}`);
  if (autoGal && !IS_IOS) { download(fname(key), rec.blob, true); photos.get(key).gal = Date.now(); persist(key); }
  cloudSoon(1500);
});
$("rRetake").addEventListener("click", () => { const k = pending ? pending.key : target; closeReview(); openCamera(k); });
$("rCancel").addEventListener("click", closeReview);

// ---------- Nama file & unduhan ----------
/* Contoh: 2026-11-03 09.12 - Kelas 1 - Tampak Depan.jpg */
function fname(k) {
  const q = parseKey(k), ph = photos.get(k);
  if (q.keg) return `${tgl(ph.t)} ${jam(ph.t)}.${two(new Date(ph.t).getSeconds())} - Kegiatan - ${clean(ph.cap || "Kegiatan")}.jpg`;
  const p = paket.find(x => x.id === q.pid), a = angleOf(q.ak, q.st);
  return `${tgl(ph.t)} ${jam(ph.t)} - ${clean(p.nama)} - ${a.l}${q.st ? " - " + pn(q.st) + "%" : ""}.jpg`;
}
/* ---------- Simpan ke galeri HP ----------
   iPhone/iPad: lewat menu Bagikan → "Simpan Gambar/Video" (masuk ke app Foto); maks. 10 file per kali.
   Android/komputer: diunduh → tampil di Galeri (album Download). */
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let galQ = null;
// Item galeri membawa rujukan rekaman agar yang sudah pernah disimpan tidak tersimpan dua kali
const phItem = k => { const ph = photos.get(k); return { name: fname(k), blob: ph.blob, t: ph.t, ref: { kind: "p", k } }; };
// Versi tanpa stamp (foto asli yang disimpan saat memotret); null bila tidak ada (mis. foto galeri yang sudah ber-stamp)
const phPlainItem = k => { const ph = photos.get(k); return ph && ph.orig && !ph.raw ? { name: fname(k).replace(/\.jpg$/, " - tanpa stamp.jpg"), blob: ph.orig, t: ph.t, ref: { kind: "p", k, plain: true } } : null; };
function savePlain(keys, label) {
  const items = keys.map(phPlainItem).filter(Boolean), miss = keys.length - items.length;
  if (!items.length) return toast(keys.length === 1 ? "Foto ini tidak punya versi tanpa stamp (dari galeri yang sudah ber-stamp, atau dari HP lain yang belum diperbarui)." : "Foto-foto ini tidak punya versi tanpa stamp.");
  saveToGallery(items, label);
  if (miss) setTimeout(() => toast(`${miss} foto dilewati: tidak punya versi tanpa stamp (dari galeri yang sudah ber-stamp, atau belum terambil dari HP lain).`), 2500);
}
const vidItems = (k, name) => { const v = videos.get(k);
  return [{ name, blob: v.blob, t: v.t, ref: { kind: "v", k } }, ...(v.plain ? [{ name: name.replace(/(\.\w+)$/, " - polos$1"), blob: v.plain, t: v.t, ref: { kind: "v", k } }] : [])]; };
const recOf = r => (r.kind === "p" ? photos.get(r.k) : videos.get(r.k));
function markGal(items) {
  const now = Date.now(), done = new Set();
  for (const it of items) { if (!it.ref) continue; const id = it.ref.kind + it.ref.k + (it.ref.plain ? "P" : ""); if (done.has(id)) continue; done.add(id);
    const r = recOf(it.ref); if (!r) continue; r[it.ref.plain ? "galP" : "gal"] = now; it.ref.kind === "p" ? persist(it.ref.k) : persistVid(it.ref.k); }
  render();
}
function saveToGallery(all, label, force) {
  if (!all.length) return toast("Belum ada file untuk disimpan.");
  const galOf = it => (recOf(it.ref) || {})[it.ref.plain ? "galP" : "gal"];
  const items = force ? all : all.filter(it => !(it.ref && galOf(it)));
  const skipped = all.length - items.length;
  if (!items.length) {
    const g0 = all[0].ref && galOf(all[0]);
    return toast(all.length === 1 && g0 ? `Sudah pernah disimpan ke galeri (${tgl(g0)} ${jam(g0)}).` : `Semua (${all.length}) sudah pernah disimpan ke galeri.`,
      "Simpan ulang", () => saveToGallery(all, label, true));
  }
  const files = items.map(it => new File([it.blob], it.name, { type: it.blob.type || (/\.mp4$/i.test(it.name) ? "video/mp4" : "image/jpeg"), lastModified: it.t || Date.now() }));
  const note = skipped ? ` ${skipped} yang sudah pernah disimpan dilewati.` : "";
  if (IS_IOS && navigator.canShare && navigator.canShare({ files: files.slice(0, 1) })) {
    galQ = { files, items, i: 0, label, note }; return galNext();
  }
  files.forEach((f, i) => setTimeout(() => download(f.name, f, true), i * 450));
  markGal(items);
  toast((files.length > 1 ? `${files.length} file disimpan ke folder Download (tampil di Galeri). Bila diminta, izinkan "unduh banyak file".` : "Disimpan ke folder Download (tampil di Galeri).") + note);
}
function galNext() {
  const q = galQ; if (!q) return;
  const part = q.files.slice(q.i, q.i + 10), n = Math.ceil(q.files.length / 10), no = q.i / 10 + 1;
  navigator.share({ files: part, title: q.label || "Simpan ke Foto" }).then(() => {
    markGal(q.items.slice(q.i, q.i + 10));
    q.i += 10;
    if (q.i < q.files.length) toast(`Bagian ${no}/${n} tersimpan. Lanjutkan bagian berikutnya.`, `Lanjut ${no + 1}/${n}`, galNext);
    else { galQ = null; toast("Tersimpan. Cek di app Foto." + (q.note || "")); }
  }).catch(e => { if (e && e.name !== "AbortError") toast("Gagal membuka menu: " + e.message); });
  if (no === 1) toast(`Pilih "Simpan ${part.length} ${/video/.test(part[0].type) ? "Video" : "Gambar"}" di menu yang terbuka.`);
}
let autoGal = false;
try { autoGal = localStorage.getItem("kka-autogal") === "1"; } catch (e) {}
$("optAutoGal").checked = autoGal;
$("optAutoGal").addEventListener("change", e => { autoGal = e.target.checked; try { localStorage.setItem("kka-autogal", autoGal ? "1" : "0"); } catch (er) {}
  toast(autoGal ? (IS_IOS ? "Di iPhone simpan otomatis tidak didukung Safari; pakai tombol Simpan ke galeri." : "Setiap foto/video baru juga disimpan ke Galeri (folder Download).") : "Simpan otomatis ke galeri dimatikan."); });
function download(filename, blob, quiet) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  if (!quiet) toast("Diunduh: " + filename);
}

let vKey = null;
let vPlainUrl = null, vShowPlain = false;
function openViewer(k) {
  vKey = k; vShowPlain = false; if (vPlainUrl) { URL.revokeObjectURL(vPlainUrl); vPlainUrl = null; }
  $("vImg").src = photos.get(k).url; $("vImg").alt = fname(k);
  const two = !!phPlainItem(k);
  $("vSavePlain").hidden = !two; $("vFlip").hidden = !two; $("vFlip").textContent = "👁 Lihat tanpa stamp";
  $("viewer").hidden = false;
}
// Bandingkan dua versi foto: dengan stamp ↔ tanpa stamp
$("vFlip").onclick = () => {
  const ph = photos.get(vKey); if (!ph || !ph.orig) return;
  vShowPlain = !vShowPlain;
  if (vShowPlain && !vPlainUrl) vPlainUrl = URL.createObjectURL(ph.orig);
  $("vImg").src = vShowPlain ? vPlainUrl : ph.url;
  $("vFlip").textContent = vShowPlain ? "👁 Lihat dengan stamp" : "👁 Lihat tanpa stamp";
};
$("vClose").onclick = () => ($("viewer").hidden = true);
$("viewer").addEventListener("click", e => { if (e.target.id === "viewer") $("viewer").hidden = true; });
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  $("viewer").hidden = true; $("guide").hidden = true;
  if (!$("review").hidden) closeReview();
});
$("vSave").onclick = () => saveToGallery([phItem(vKey)], "Simpan foto");
$("vSavePlain").onclick = () => savePlain([vKey], "Simpan foto tanpa stamp");
$("galPlainBtn").onclick = () => savePlain(viewKeys(), "Simpan tanpa stamp");
$("galAllBtn").onclick = () => saveToGallery(viewKeys().map(phItem),
  screen === "kegiatan" ? "Foto kegiatan" : stageName(view));
$("vShare").onclick = () => shareKeys([vKey], labelOf(vKey));
$("vDel").onclick = () => {
  const b = $("vDel");
  if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Yakin hapus?"; setTimeout(() => { delete b.dataset.armed; b.textContent = "Hapus"; }, 3000); return; }
  delete b.dataset.armed; b.textContent = "Hapus";
  const ph = photos.get(vKey); if (ph) URL.revokeObjectURL(ph.url);
  cloudForget(photos.get(vKey)); photos.delete(vKey); dbPut(vKey, null); $("viewer").hidden = true; render(); toast("Foto dihapus.");
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
    : view === 0 ? `Foto Kondisi Awal - ${clean(profil.nama || "Sekolah")}` : `Foto Progres ${pn(view)}% - ${clean(profil.nama || "Sekolah")}`;
  const entries = []; let first = Infinity;
  for (const k of viewKeys()) {
    const ph = photos.get(k), q = parseKey(k);
    first = Math.min(first, ph.t);
    const sub = q.keg ? kegFolder(ph) + "/" : clean(paket.find(x => x.id === q.pid).nama) + "/";
    entries.push({ path: `${rootName}/${sub}${fname(k)}`, blob: ph.blob, date: new Date(ph.t) });
  }
  toast("Menyusun ZIP…");
  const blob = await window.makeZip(entries);
  download(`${rootName} - ${tgl(first)}.zip`, blob);
};

// ---------- Unggah ke Drive (menu Bagikan bawaan HP) ----------
/* Membuka menu Bagikan iPhone/Android berisi foto-foto ini. Pilih "Drive", lalu pilih folder tujuan.
   Tidak menyimpan ke galeri. Foto yang sudah dibagikan ditandai "✓ Drive". */
/* Chrome Android menolak berbagi > 10 file atau > ~50 MB sekaligus ("Permission denied").
   Maka foto dikirim per bagian (maks. 10 foto / 40 MB); bagian berikutnya dikirim dengan satu ketukan lagi. */
const SHARE_MAX_FILES = 10, SHARE_MAX_BYTES = 40 * 1024 * 1024;
let shareQ = null; // { batches, i, title, all }
function splitBatches(keys) {
  const out = []; let cur = [], bytes = 0;
  for (const k of keys) {
    const sz = photos.get(k).blob.size;
    if (cur.length && (cur.length >= SHARE_MAX_FILES || bytes + sz > SHARE_MAX_BYTES)) { out.push(cur); cur = []; bytes = 0; }
    cur.push(k); bytes += sz;
  }
  if (cur.length) out.push(cur);
  return out;
}
function shareKeys(keys, title) {
  if (!keys.length) return toast("Belum ada foto untuk diunggah.");
  shareQ = { batches: splitBatches(keys), i: 0, title, all: keys.join("\n") };
  shareNext();
}
function shareNext() {
  const q = shareQ; if (!q) return;
  const keys = q.batches[q.i], n = q.batches.length;
  const files = keys.map(k => { const ph = photos.get(k); return new File([ph.blob], fname(k), { type: "image/jpeg", lastModified: ph.t }); });
  if (!navigator.share || !navigator.canShare || !navigator.canShare({ files })) {
    shareQ = null; renderShareBtn();
    return toast("HP/browser ini belum mendukung kirim langsung. Pakai Unduh (.zip), lalu unggah lewat aplikasi Drive.");
  }
  const title = n > 1 ? `${q.title} (bagian ${q.i + 1}/${n})` : q.title;
  navigator.share({ files, title }).then(() => {
    const now = Date.now();
    keys.forEach(k => { const ph = photos.get(k); if (ph) { ph.up = now; persist(k); } });
    q.i++;
    if (q.i < n) {
      render(); renderShareBtn();
      toast(`Bagian ${q.i}/${n} terkirim (${keys.length} foto). Lanjutkan bagian berikutnya.`, `Lanjut ${q.i + 1}/${n}`, shareNext);
    } else {
      const total = q.batches.reduce((a, b) => a + b.length, 0);
      shareQ = null; render(); renderShareBtn(); toast(`${total} foto dibagikan. Periksa di Google Drive.`);
    }
  }).catch(e => {
    if (e && e.name === "AbortError") return;
    toast(e && e.name === "NotAllowedError"
      ? "Menu Bagikan ditolak HP. Coba ketuk lagi, atau unggah per ruang lewat tombol \"Unggah ke Drive\" di tiap kelas."
      : "Gagal membuka menu Bagikan: " + (e && e.message));
  });
}
function renderShareBtn() {
  const b = $("shareAllBtn"), q = shareQ;
  if (q && q.i > 0 && q.i < q.batches.length && q.all === viewKeys().join("\n")) b.textContent = `Lanjut unggah ${q.i + 1}/${q.batches.length}`;
  else b.textContent = "Unggah ke Drive";
}
$("shareAllBtn").onclick = () => {
  const keys = viewKeys();
  if (shareQ && shareQ.i > 0 && shareQ.all === keys.join("\n")) return shareNext(); // lanjutkan bagian berikutnya
  shareKeys(keys, screen === "kegiatan" ? "Foto kegiatan" : stageName(view));
};

// ---------- Sinkronisasi Supabase ----------
/* ---------- Sinkron antar-HP: akun Google + Google Drive ----------
   Semua HP yang masuk dengan akun Google yang sama memakai satu folder Drive:
     Kamera Revit SD - <Sekolah> (NPSN …)/
       FOTO_REVITSD_<persen>/<Ruang>/…jpg
       VIDEO_REVITSD_<persen>/<Ruang>/01 - <Ruang>.mp4        (video bercap, atau polos bila "polos saja")
       VIDEO_REVITSD_<persen> (polos)/<Ruang>/01 - <Ruang>.mp4 (salinan polos dari mode dua versi)
       Kegiatan/<judul kegiatan>/, Video lainnya/, _data-aplikasi.json (daftar ruang, tahap, profil)
   Tiap file diberi appProperties (npsn, kind, k = kunci di aplikasi, dst.) agar HP lain bisa memetakannya kembali.
   Catatan: dideklarasikan dengan function/var karena saveState() & persist() bisa terpanggil sebelum blok ini dijalankan. */
var cloudBusy = false, cloudAgain = false, cloudTimer = null, cloudApplying = false, cloudMsg = "", cloudProg = "", cloudLast = 0, cloudForce = false;
function cloudOn() { return !!(window.GD && GD.enabled && GD.known); }
function cloudSoon(ms) { if (!cloudOn() || cloudApplying) return; clearTimeout(cloudTimer); cloudTimer = setTimeout(() => cloudSync(false), ms || 4000); }
function cloudStateSoon() { cloudSoon(6000); }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
function stateHash() { return JSON.stringify({ paket, stages: STAGES, profil }); }
const numOr = v => (v === undefined || v === "" || v === "null" ? null : +v);
const sv = v => (v == null ? "" : String(v));
function cloudPending() {
  let n = 0;
  for (const [k, ph] of photos) if (!ph.gs && (inPaket(k) || k.startsWith("#keg|"))) n++;
  for (const [, v] of videos) if (v.blob && !v.gs && (!v.room || paket.some(p => p.id === v.room))) n++;
  try { n += JSON.parse(lsGet("kka-gtomb") || "[]").length; } catch (e) {}
  return n;
}
function applyRemoteState(j) {
  cloudApplying = true;
  try {
    if (Array.isArray(j.paket) && j.paket.length) paket = j.paket;
    if (Array.isArray(j.stages) && j.stages.length) { STAGES = j.stages; saveStages(); }
    if (j.profil) profil = { ...profil, ...j.profil };
    saveState();
    for (const [id, k] of Object.entries(fmap)) $(id).value = profil[k] || "";
    $("pGaya").value = profil.gaya || "lengkap"; $("pPeta").value = profil.peta || "satelit";
    if (window.KKAGeo && KKAGeo.setSource) KKAGeo.setSource(profil.peta || "satelit");
    renderHeader();
  } finally { cloudApplying = false; }
}

async function cloudSync(manual) {
  if (!cloudOn()) return;
  if (cloudBusy) { cloudAgain = true; return; }
  if (!GD.valid) { cloudMsg = "Sesi Google berakhir — ketuk Masuk lagi."; renderCloud(); return; }
  if (!navigator.onLine) { cloudMsg = "Tidak ada internet — dikirim otomatis saat online."; renderCloud(); if (manual) toast(cloudMsg); return; }
  const npsn = (profil.npsn || "").trim();
  if (!npsn || !profil.nama) { cloudMsg = "Isi nama sekolah dan NPSN dulu."; renderCloud(); if (manual) toast(cloudMsg); return; }
  cloudBusy = true; cloudProg = "Memeriksa Drive…"; renderCloud();
  let wake = null; try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch (e) {}
  let up = 0, down = 0, gone = 0, kept = 0;
  try {
    if (!GD.email) await GD.me();
    // Kunci sinkron = akun Google + NPSN. Bila akun atau sekolah berganti: mulai folder baru, semua dikirim ulang
    // (dan TIDAK ada foto lokal yang dihapus karena tidak ditemukan di akun baru).
    const syncKey = GD.email + "|" + npsn, prevKey = lsGet("kka-gnpsn");
    if (prevKey === npsn) lsSet("kka-gnpsn", syncKey); // format lama (hanya NPSN): anggap akun yang sama
    else if (prevKey !== syncKey) {
      GD.forgetFolders();
      for (const [k, ph] of photos) { ph.gs = false; ph.gid = undefined; persist(k); }
      for (const [k, v] of videos) { v.gs = false; v.gid = v.gidP = undefined; persistVid(k); }
      lsSet("kka-gstateh", null); lsSet("kka-gstatet", null); lsSet("kka-gtomb", null);
      lsSet("kka-gnpsn", syncKey);
      if (prevKey) toast(`Akun Google berganti ke ${GD.email}. Semua foto & video di HP ini dikirim ke Drive akun ini.`);
    }
    const rootName = `Kamera Revit SD - ${profil.nama} (NPSN ${npsn})`;
    const F = path => GD.folder(npsn, path, rootName);
    // ---- 0) Buang dulu file Drive dari foto/video yang dihapus di HP ini (agar tidak tertarik kembali)
    let tomb = []; try { tomb = JSON.parse(lsGet("kka-gtomb") || "[]"); } catch (e) {}
    while (tomb.length) { await GD.trash(tomb[0]); tomb.shift(); lsSet("kka-gtomb", JSON.stringify(tomb)); }
    const remote = await GD.list({ kka: "file", npsn });

    // ---- 1) Tarik daftar ruang/tahap/profil dari HP lain
    const stF = remote.find(f => f.appProperties.kind === "state");
    const sentH = lsGet("kka-gstateh");
    if (stF && stF.modifiedTime !== lsGet("kka-gstatet") && (sentH == null || sentH === stateHash())) {
      const j = JSON.parse(await (await GD.download(stF.id)).text());
      applyRemoteState(j);
      lsSet("kka-gstatet", stF.modifiedTime); lsSet("kka-gstateh", stateHash());
    }

    // ---- 2) Tarik foto/video baru dari HP lain
    const byK = new Map();
    for (const f of remote) {
      const a = f.appProperties; if (a.kind === "state" || !a.k) continue;
      const e = byK.get(a.k) || {}; e[a.var === "plain" ? "plain" : "main"] = f; byK.set(a.k, e);
    }
    let pullTotal = 0;
    for (const [k, e] of byK) { const a = e.main && e.main.appProperties; if (!a) continue;
      if (a.kind === "photo" ? !(photos.get(k) && photos.get(k).gid === e.main.id) : !videos.get(k)) pullTotal++; }
    const pullOne = async (k, e) => {
      await pullMain(k, e);
      // versi tanpa stamp foto kegiatan dari HP lain (kecil; diambil sekalian)
      const ph = photos.get(k), fp = e.plain;
      if (fp && ph && fp.appProperties.kind === "photo" && !ph.raw && ph.gidP !== fp.id && ph.gid === (e.main && e.main.id)) {
        try { ph.orig = await GD.download(fp.id); ph.gidP = fp.id; persist(k); } catch (er) { if (er instanceof GD.AuthError) throw er; }
      }
    };
    const pullMain = async (k, e) => {
      const f = e.main; if (!f) return; const a = f.appProperties;
      if (a.kind === "photo") {
        if (!photos.has(k)) { // file yang sama pindah kunci di HP lain (mis. tahap 4% → 5%): ganti kunci di sini juga
          const old = [...photos.entries()].find(([kk, r]) => r.gid === f.id && kk !== k && r.gs); // hanya bila tidak ada ubahan lokal yang belum terkirim
          if (old) { photos.delete(old[0]); dbPut(old[0], null); photos.set(k, { ...old[1], gmod: "" }); persist(k); }
        }
        const loc = photos.get(k);
        if (loc && loc.gid === f.id && (!loc.gs || loc.gmod === f.modifiedTime)) return;
        if (loc && !loc.gs) { // diubah di HP ini dan belum terkirim: perubahan lokal yang dipakai
          if (!loc.gid && loc.t >= +a.t) { loc.gid = f.id; persist(k); return; }
          if (loc.gid) return;
        }
        cloudProg = `Mengambil foto dari HP lain… ${down + 1}/${pullTotal}`; renderCloud();
        const blob = await GD.download(f.id);
        if (loc && loc.url) URL.revokeObjectURL(loc.url);
        photos.set(k, { blob, t: +a.t || Date.now(), lat: numOr(a.lat), lng: numOr(a.lng), acc: numOr(a.acc), sv: a.sv || undefined, cap: a.cap || undefined,
          gid: f.id, gmod: f.modifiedTime, gs: true, gpath: a.gp || undefined, away: a.aw === "1" || undefined, raw: a.raw === "1" || undefined, url: URL.createObjectURL(blob) });
        persist(k); down++; paint();
      } else if (a.kind === "video") {
        const loc = videos.get(k);
        if (loc) {
          if (!loc.gs && !loc.gid) { loc.gid = f.id; loc.gidP = e.plain && e.plain.id; }
          else if (loc.gs && !loc.metaDirty && ((a.shot || "") !== (loc.shot || "") || (a.st !== undefined && a.st !== "" && +a.st !== loc.st) || (!loc.room && a.title && a.title !== loc.title))) {
            loc.shot = a.shot || undefined; if (a.st !== undefined && a.st !== "") loc.st = +a.st; if (a.title) loc.title = a.title; persistVid(k); }
          return;
        }
        // Video TIDAK diunduh di sini (besar): cukup datanya; isi video diambil saat diputar/dibagikan/dipakai (lihat fetchVids)
        videos.set(k, { blob: undefined, remote: true, size: +f.size || 0, sizeP: e.plain ? +e.plain.size || 0 : 0, hasPlain: !!e.plain,
          nostamp: a.ns === "1" || undefined, t: +a.t || Date.now(), dur: +a.dur || 0, title: a.title || "Video",
          mime: f.mimeType || "video/mp4", ext: a.ext || "mp4", room: a.room || undefined, shot: a.shot || undefined, native: a.nat === "1" || undefined, st: a.st !== undefined && a.st !== "" ? +a.st : undefined,
          gid: f.id, gidP: e.plain ? e.plain.id : undefined, gs: true, fixed: 1 });
        persistVid(k); down++; paint();
      }
    };
    // foto (kecil) diambil dulu, baru video; tampilan diperbarui bertahap selama mengunduh
    const pulls = [...byK].sort((x, y) => ((x[1].main || {}).appProperties?.kind === "video") - ((y[1].main || {}).appProperties?.kind === "video"));
    let lastPaint = 0;
    const paint = () => { if (Date.now() - lastPaint > 1500) { lastPaint = Date.now(); render(); } };
    await Promise.all([0, 1, 2].map(async () => { while (pulls.length) { const [k, e] = pulls.shift(); await pullOne(k, e); } }));

    // ---- 3) Yang sudah dihapus di HP lain ikut dihapus di sini
    // Hanya dihapus bila file Drive-nya ada di Sampah DAN dihapus lewat aplikasi (tanda del=1).
    // File yang dibuang/dirapikan langsung di Drive TIDAK menghapus foto di HP: fotonya dikirim ulang.
    // File yang tidak dikenal akun ini (404) juga tidak menghapus apa pun: dikirim ulang ke akun ini.
    const ids = new Set(remote.map(f => f.id));
    const cand = [...[...photos].map(([k, r]) => ["p", k, r]), ...[...videos].map(([k, r]) => ["v", k, r])]
      .filter(([, , r]) => r.gs && r.gid && !ids.has(r.gid));
    for (const [kind, k, r] of cand) {
      let trashed = false, byApp = false;
      try { const st = await GD.stat(r.gid); trashed = !!st.trashed; byApp = !!(st.appProperties && st.appProperties.del === "1"); }
      catch (e) { if (e instanceof GD.AuthError) throw e; if (e.status === 404 && r.blob) { r.gs = false; r.gid = r.gidP = undefined; kind === "p" ? persist(k) : persistVid(k); } continue; }
      if (!trashed) continue;
      if (!byApp) { // dibuang langsung di Drive: foto/video di HP tetap disimpan dan dikirim ulang sebagai file baru
        if (r.blob) { r.gs = false; r.gid = r.gidP = undefined; r.gpath = undefined; kind === "p" ? persist(k) : persistVid(k); kept++; }
        continue;
      }
      if (r.url) URL.revokeObjectURL(r.url);
      (kind === "p" ? photos : videos).delete(k); dbPut(k, null); gone++;
    }

    // ---- 5+6) Kirim foto & video baru — 3 sekaligus agar cepat; video ruangan didahulukan agar tidak menunggu semua foto
    const jobs = [];
    for (const [k, v] of [...videos]) {
      if (!v.blob) continue; // video yang belum diambil dari Drive tidak bisa dikirim
      if (v.gs && v.reup) { jobs.push({ rank: 0, run: async () => { // ganti isi file Drive dengan video yang sudah diperbaiki
        for (const [id, b] of [[v.gid, v.blob], [v.gidP, v.plain]]) if (id && b) { try { await GD.put(b, {}, id); } catch (e) { if (e.status !== 404) throw e; } }
        v.reup = undefined; persistVid(k); } }); continue; }
      if (v.gs && v.metaDirty && v.room && paket.some(x => x.id === v.room)) { jobs.push({ rank: 0, run: () => upVideoMeta(k, v) }); continue; }
      if (v.gs && v.metaDirty && !v.room) { jobs.push({ rank: 0, run: async () => { // judul video bebas diganti: nama file & keterangan di Drive
        const name = vidName(k), meta = t => ({ name: t, appProperties: { title: sv(v.title).slice(0, 90) } });
        for (const [id, nm] of [[v.gid, name], [v.gidP, name.replace(/(\.\w+)$/, " - polos$1")]]) if (id) { try { await GD.patch(id, meta(nm)); } catch (e) { if (e.status !== 404) throw e; } }
        v.metaDirty = undefined; persistVid(k); } }); continue; }
      if (v.gs) continue;
      if (v.room && !paket.some(x => x.id === v.room)) continue;
      jobs.push({ rank: v.room ? 0 : 2, run: () => upVideo(k, v) });
    }
    for (const [k, ph] of [...photos]) {
      if (ph.gs && ph.gid && k.startsWith("#keg|") && ph.gpath !== `Kegiatan/${kegFolder(ph)}`) { // pindahkan ke folder judulnya
        jobs.push({ rank: 1, run: async () => { const path = `Kegiatan/${kegFolder(ph)}`;
          try { const mv = await GD.move(ph.gid, await F(path)); if (mv && mv.modifiedTime) ph.gmod = mv.modifiedTime; } catch (e) { if (e.status !== 404) throw e; }
          if (ph.gidP || ph.orig) await upPlain(k, ph);
          ph.gpath = path; persist(k); } });
        continue;
      }
      if (ph.gs && (inPaket(k) || k.startsWith("#keg|")) && ph.orig && !ph.raw && !ph.gidP) { jobs.push({ rank: 3, run: () => upPlain(k, ph) }); continue; } // foto lama: lengkapi versi tanpa stamp
      if (ph.gs || ph.bad || !(inPaket(k) || k.startsWith("#keg|"))) continue;
      jobs.push({ rank: 1, run: () => upPhoto(k, ph) });
    }
    jobs.sort((x, y) => x.rank - y.rank);
    const total = jobs.length;
    const tick = () => { cloudProg = `Mengirim ke Drive… ${up}/${total}`; renderCloud(); };
    async function upPhoto(k, ph) {
      const q = parseKey(k);
      const path = q.keg ? `Kegiatan/${kegFolder(ph)}` : `FOTO_REVITSD_${pn(q.st)}/${clean(paket.find(p => p.id === q.pid).nama)}`;
      const props = { kka: "file", npsn, kind: "photo", k, t: sv(ph.t), lat: sv(ph.lat), lng: sv(ph.lng), acc: sv(ph.acc), sv: sv(ph.sv), cap: sv(ph.cap).slice(0, 90), gp: path.slice(0, 100), aw: ph.away ? "1" : "", raw: ph.raw ? "1" : "" };
      const meta = { name: fname(k), appProperties: props };
      let r = null;
      if (ph.gid) {
        try {
          r = await GD.put(ph.blob, meta, ph.gid);
          if (ph.gpath && ph.gpath !== path) { // judul/ruang berubah: pindah folder
            const mv = await GD.move(ph.gid, await F(path)); if (mv && mv.modifiedTime) r.modifiedTime = mv.modifiedTime; }
        } catch (e) { if (e.status !== 404) throw e; }
      }
      if (!r) r = await GD.put(ph.blob, { ...meta, parents: [await F(path)], mimeType: "image/jpeg" });
      await upPlain(k, ph, props, true);
      const cur = photos.get(k);
      if (cur === ph) { ph.gid = r.id; ph.gmod = r.modifiedTime; ph.gs = true; ph.gpath = path; persist(k); }
      else if (cur && !cur.gid) { cur.gid = r.id; persist(k); } // diganti saat sedang dikirim: versi baru akan memperbarui file yang sama
    }
    /* Versi tanpa stamp ikut dikirim agar aman dan bisa diunduh dari HP lain:
       foto persen → "FOTO_REVITSD_<persen> (tanpa stamp)/<ruang>", foto kegiatan → "Kegiatan (tanpa stamp)/<judul>" */
    const plainPath = (k, ph) => { const q = parseKey(k); if (q.keg) return `Kegiatan (tanpa stamp)/${kegFolder(ph)}`;
      const p = paket.find(x => x.id === q.pid); return p ? `FOTO_REVITSD_${pn(q.st)} (tanpa stamp)/${clean(p.nama)}` : null; };
    async function upPlain(k, ph, props, content) {
      if (!ph.orig || ph.raw) return;
      const pathP = plainPath(k, ph); if (!pathP) return;
      const metaP = { name: fname(k).replace(/\.jpg$/, " - tanpa stamp.jpg"), appProperties: { ...(props || { kka: "file", npsn, kind: "photo", k, t: sv(ph.t), cap: sv(ph.cap).slice(0, 90) }), var: "plain", gp: pathP.slice(0, 100) } };
      let done = false;
      if (ph.gidP) {
        try { content ? await GD.put(ph.orig, metaP, ph.gidP) : await GD.patch(ph.gidP, metaP); await GD.move(ph.gidP, await F(pathP)); done = true; } catch (e) { if (e.status !== 404) throw e; }
      }
      if (!done) ph.gidP = (await GD.put(ph.orig, { ...metaP, parents: [await F(pathP)], mimeType: "image/jpeg" })).id;
      persist(k);
    }
    async function upVideoMeta(k, v) { // label sudut berubah: perbarui nama file & keterangan di Drive
      const p = paket.find(x => x.id === v.room);
      const idx = Math.max(0, roomClips(v.room, v.st).findIndex(([kk]) => kk === k));
      const name = rvName(p, idx, v, "stamp");
      const meta = { name, appProperties: { shot: sv(v.shot), title: sv(v.title).slice(0, 90), st: sv(v.st) } };
      const path = `VIDEO_REVITSD_${pn(v.st)}/${clean(p.nama)}`, pathP = `VIDEO_REVITSD_${pn(v.st)} (polos)/${clean(p.nama)}`;
      for (const [id, pth] of [[v.gid, path], [v.gidP, pathP]]) if (id) {
        try { await GD.patch(id, meta); await GD.move(id, await F(pth)); } catch (e) { if (e.status !== 404) throw e; }
      }
      v.metaDirty = undefined; persistVid(k);
    }
    async function upVideo(k, v) {
      let path, pathP, name, nameP;
      if (v.room) {
        const p = paket.find(x => x.id === v.room);
        const idx = Math.max(0, roomClips(v.room, v.st).findIndex(([kk]) => kk === k));
        path = `VIDEO_REVITSD_${pn(v.st)}/${clean(p.nama)}`; pathP = `VIDEO_REVITSD_${pn(v.st)} (polos)/${clean(p.nama)}`;
        name = rvName(p, idx, v, "stamp"); nameP = name;
      } else { path = "Video lainnya"; pathP = "Video lainnya/polos"; name = vidName(k); nameP = name.replace(/(\.\w+)$/, " - polos$1"); }
      const base = { kka: "file", npsn, kind: "video", k, t: sv(v.t), dur: sv(Math.round((v.dur || 0) * 10) / 10), title: sv(v.title).slice(0, 90),
        ext: sv(v.ext), room: sv(v.room), st: sv(v.st), ns: v.nostamp ? "1" : "", shot: sv(v.shot), nat: v.native ? "1" : "" };
      if (!v.gid) { v.gid = (await GD.put(v.blob, { name, parents: [await F(path)], appProperties: { ...base, var: "main" } })).id; persistVid(k); }
      if (v.plain && !v.gidP) { v.gidP = (await GD.put(v.plain, { name: nameP, parents: [await F(pathP)], appProperties: { ...base, var: "plain" } })).id; persistVid(k); }
      if (videos.get(k) === v) { v.gs = true; persistVid(k); }
    }
    tick();
    let firstErr = null;
    const worker = async () => {
      while (jobs.length && !firstErr) {
        const j = jobs.shift();
        try { await j.run(); up++; tick(); }
        catch (e) { if (e instanceof GD.AuthError) firstErr = e; else firstErr = firstErr || e; }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (firstErr) throw firstErr;

    // ---- 7) Kirim daftar ruang/tahap/profil bila berubah
    const h = stateHash();
    if (!stF || h !== lsGet("kka-gstateh")) {
      const blob = new Blob([JSON.stringify({ paket, stages: STAGES, profil, t: Date.now() })], { type: "application/json" });
      const meta = { name: "_data-aplikasi.json", appProperties: { kka: "file", npsn, kind: "state", k: "state" } };
      const r = stF ? await GD.put(blob, meta, stF.id) : await GD.put(blob, { ...meta, parents: [await F("")] });
      lsSet("kka-gstateh", h); lsSet("kka-gstatet", r.modifiedTime);
    }
    cloudLast = Date.now();
    cloudMsg = up || down || gone || kept ? [up && `${up} terkirim`, down && `${down} baru dari HP lain`, gone && `${gone} dihapus`, kept && `${kept} yang dibuang di Drive dikirim ulang (masih ada di HP)`].filter(Boolean).join(" · ") : "Sudah sama dengan Drive";
    if (down) toast(`${down} foto/video baru dari HP lain.`);
    else if (manual) toast(cloudMsg + ".");
  } catch (e) {
    const net = /fetch|network|timeout|abort|Load failed/i.test(e.message || "") || e.name === "TimeoutError" || e.name === "AbortError";
    cloudMsg = e instanceof GD.AuthError ? "Sesi Google berakhir — ketuk Masuk lagi."
      : net ? "Sinyal lemah/terputus — foto aman di HP, dikirim otomatis saat sinyal kembali." : "Gagal sinkron: " + e.message;
    if (net) cloudSoon(60000); // coba lagi otomatis
    if (manual) toast(cloudMsg);
  } finally {
    cloudBusy = false; cloudProg = ""; renderCloud(); render();
    if (wake) wake.release().catch(() => {});
    if (cloudAgain) { cloudAgain = false; cloudSoon(1500); }
  }
}

function renderCloud() {
  if (!window.GD) return;
  $("cloudOff").hidden = GD.enabled;
  $("cloudLogin").hidden = !GD.enabled || GD.known;
  $("cloudIn").hidden = !GD.enabled || !GD.known;
  if (!GD.enabled || !GD.known) return;
  const pend = cloudPending();
  $("cloudUser").textContent = GD.email || "Akun Google";
  $("cloudDot").className = "dot " + (!GD.valid ? "err" : cloudBusy ? "wait" : pend ? "wait" : "on");
  $("cloudState").textContent = !GD.valid ? "Sesi berakhir — ketuk Masuk lagi untuk melanjutkan sinkron."
    : cloudBusy ? cloudProg || "Menyinkronkan…"
    : [pend ? `${pend} antre dikirim` : "Semua tersinkron", cloudMsg && cloudMsg !== "Sudah sama dengan Drive" ? cloudMsg : "",
      cloudLast ? "terakhir " + jam(cloudLast) : ""].filter(Boolean).join(" · ");
  $("cloudRelogin").hidden = GD.valid;
  $("cloudSyncBtn").hidden = !GD.valid; $("cloudSyncBtn").disabled = cloudBusy;
  $("cloudSwitch").hidden = !GD.valid;
  { const rem = [...videos.values()].filter(v => v.remote && !v.blob);
    $("cloudVidAll").hidden = !GD.valid || !rem.length;
    $("cloudVidAll").textContent = `Ambil semua video ke HP ini (${rem.length} · ${(rem.reduce((a, v) => a + (v.size || 0) + (v.sizeP || 0), 0) / 1048576).toFixed(0)} MB)`; }
  // pilihan folder untuk tautan portal
  const sel = $("cloudFolder"), prev = sel.value;
  sel.innerHTML = STAGES.flatMap(st => [`FOTO_REVITSD_${pn(st)}`, `VIDEO_REVITSD_${pn(st)}`, `VIDEO_REVITSD_${pn(st)} (polos)`])
    .concat(["Kegiatan"]).map(x => `<option>${esc(x)}</option>`).join("");
  if (prev) sel.value = prev;
}
function cloudLoginGo() {
  if (pending || !$("review").hidden) { toast("Simpan atau batalkan foto yang sedang ditinjau dulu."); return; }
  GD.login(cloudForce);
}
$("cloudLoginBtn").addEventListener("click", () => { cloudForce = true; cloudLoginGo(); });
$("cloudRelogin").addEventListener("click", cloudLoginGo);
$("cloudSyncBtn").addEventListener("click", () => cloudSync(true));
$("cloudOut").addEventListener("click", e => {
  const b = e.currentTarget;
  if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Yakin keluar?"; setTimeout(() => { delete b.dataset.armed; b.textContent = "Keluar"; }, 3000); return; }
  GD.logout(); lsSet("kka-gnpsn", null); cloudMsg = ""; renderCloud(); render();
  toast("Sudah keluar dari Google. Foto di HP ini tetap ada.");
});
$("cloudLinkBtn").addEventListener("click", async () => {
  const npsn = (profil.npsn || "").trim(); if (!npsn || !profil.nama) return toast("Isi nama sekolah dan NPSN dulu.");
  if (!GD.valid) return toast("Masuk Google lagi dulu.");
  const b = $("cloudLinkBtn"); b.disabled = true;
  try {
    const id = await GD.folder(npsn, $("cloudFolder").value, `Kamera Revit SD - ${profil.nama} (NPSN ${npsn})`);
    const url = await GD.makePublic(id);
    $("cloudLink").value = url; $("cloudLinkRow").hidden = false; $("cloudOpen").href = url;
    try { await navigator.clipboard.writeText(url); toast("Link folder disalin (siapa saja yang memiliki link dapat melihat)."); }
    catch (e) { $("cloudLink").select(); toast("Link siap — salin dari kotak di bawah tombol."); }
  } catch (e) { toast("Gagal membuat link: " + e.message); }
  b.disabled = false;
});
$("cloudLink").addEventListener("focus", e => e.target.select());
/* Ganti akun Google dalam satu ketukan: pastikan HP ini sudah memegang semua data dari akun lama,
   lalu keluar dan langsung masuk ke akun baru. Semua foto & video di HP ini otomatis dikirim ke Drive akun baru. */
$("cloudSwitch").addEventListener("click", e => {
  const b = e.currentTarget;
  if (cloudBusy) return toast("Tunggu sinkron selesai dulu.");
  const errored = /Gagal|berakhir|internet/i.test(cloudMsg || "");
  if (!GD.valid || errored || !cloudLast || Date.now() - cloudLast > 10 * 60000) {
    toast("Sinkronkan dulu sampai \"Semua tersinkron\", agar semua foto & video dari akun lama sudah ada di HP ini.");
    if (GD.valid) cloudSync(true); return;
  }
  if (cloudPending()) return toast(`Masih ada ${cloudPending()} file antre. Tunggu sampai semua tersinkron.`);
  if (!b.dataset.armed) {
    b.dataset.armed = 1; b.textContent = "Ketuk lagi: keluar & masuk akun baru";
    toast(`HP ini memegang ${photos.size} foto & ${videos.size} video. Setelah masuk akun baru, semuanya dikirim ke Drive akun baru. Akun lama tidak dipakai lagi di HP ini.`);
    setTimeout(() => { delete b.dataset.armed; b.textContent = "Ganti akun Google"; }, 6000); return;
  }
  if (pending || !$("review").hidden) return toast("Simpan atau batalkan foto yang sedang ditinjau dulu.");
  GD.logout(); lsSet("kka-gnpsn", null);
  try { sessionStorage.setItem("kka-switching", "1"); } catch (er) {}
  GD.login(true); // pilih akun baru di halaman Google
});

// Pemicu sinkron: saat dibuka, kembali online, aplikasi tampil lagi, dan berkala tiap 2 menit
(function cloudBoot() {
  if (!window.GD || !GD.enabled) { renderCloud(); return; }
  if (GD.loginError) { cloudForce = true; toast(GD.loginError === "access_denied" ? "Masuk Google dibatalkan." : "Perlu memilih akun Google lagi — ketuk Masuk."); }
  let sw = false; try { sw = sessionStorage.getItem("kka-switching") === "1"; sessionStorage.removeItem("kka-switching"); } catch (e) {}
  if (GD.justLoggedIn) { goScreen("atur"); toast(sw ? "Akun baru tersambung. Semua foto & video dikirim ke Drive akun baru — biarkan aplikasi terbuka." : "Berhasil masuk Google. Menyinkronkan…"); setTimeout(() => $("cloudPanel").scrollIntoView({ block: "center" }), 300); }
  renderCloud();
  if (cloudOn() && GD.valid) setTimeout(() => cloudSync(false), GD.justLoggedIn ? 300 : 1500);
  window.addEventListener("online", () => cloudSoon(1000));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - cloudLast > 60000) cloudSoon(800); renderCloud(); });
  setInterval(() => { if (document.visibilityState === "visible" && cloudOn() && GD.valid) cloudSync(false); else renderCloud(); }, 120000);
})();

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
  renderStageEd(); render(); renderCloud();
  await checkBadPhotos();
  cloudSoon(1500);
  repairVideos();
});
/* Foto yang isinya tidak terbaca lagi (file galeri "pinjaman" di Android pada versi sebelum 2.17.4):
   ditandai agar operator memilih ulang, dan tidak dikirim ke Drive (pengiriman akan gagal terus). */
async function checkBadPhotos() {
  let n = 0;
  for (const [k, ph] of [...photos]) {
    if (ph.gs || !ph.blob) continue;
    let ok = false;
    try { ok = ph.blob.size > 0 && await canDecode(ph.blob); } catch (e) {}
    if (!ok) { ph.bad = true; n++; }
  }
  if (n) { render(); toast(`${n} foto tidak terbaca (rusak). Ketuk "Galeri" pada foto bertanda merah untuk memilih ulang.`); }
}
/* Video lama (sebelum v2.5.0) tersimpan tanpa keterangan durasi → galeri menampilkan 00:00 dan tidak bisa digeser.
   Diperbaiki sekali di latar; salinan di Drive ikut diganti isinya saat sinkron. */
async function repairVideos() {
  if (!window.KKAFix) return;
  let n = 0;
  for (const [k, v] of [...videos]) {
    if (v.fixed || !v.blob) continue;
    try {
      if (await KKAFix.needsFix(v.blob)) { v.blob = await KKAFix.fix(v.blob, v.dur); if (v.url) { URL.revokeObjectURL(v.url); v.url = null; } n++; if (v.gid) v.reup = true; }
      if (v.plain && await KKAFix.needsFix(v.plain)) { v.plain = await KKAFix.fix(v.plain, v.dur); if (v.purl) { URL.revokeObjectURL(v.purl); v.purl = null; } if (v.gidP) v.reup = true; }
      v.fixed = 1; persistVid(k);
    } catch (e) {}
  }
  if (n) { render(); toast(`${n} video lama diperbaiki: durasi kini terbaca. Unduh/bagikan ulang bila perlu.`); cloudSoon(2000); }
}

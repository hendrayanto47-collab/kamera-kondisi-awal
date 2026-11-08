# Kamera Foto Kondisi Awal — Revitalisasi SD 2026

Aplikasi web (PWA) untuk mengambil **4 foto wajib per menu paket** (Tampak Depan, Tampak Belakang,
Tampak Samping, Dalam Ruang) untuk Tab 3 *Foto Kondisi Awal* Laporan Pendahuluan.
Dipasang di HP dari **Netlify**, jalan tanpa internet.

## Fitur

- **Panduan posisi** sebelum memotret: denah tampak atas (di mana berdiri, ke mana menghadap) + tips per sudut.
  Bisa dimatikan lewat centang "Tampilkan panduan posisi sebelum memotret"; tetap bisa dibuka lewat tautan *Panduan*.
- **Pemeriksaan otomatis** setelah memotret, sebelum foto disimpan:
  | Pemeriksaan | Peringatan bila |
  |---|---|
  | Orientasi | foto portrait (landscape dianjurkan) |
  | Ketajaman | foto buram/goyang |
  | Cahaya | terlalu gelap atau silau |
  | Resolusi | sisi terpendek < 720 px (mis. tangkapan layar) |
  | Foto kembar | foto sangat mirip dengan foto lain yang sudah disimpan |
  | Waktu | foto dari galeri yang dibuat > 2 jam lalu |
  | GPS | GPS mati, akurasi > 50 m, atau lokasi > 500 m dari foto lain |

  Peringatan tidak memblokir: operator bisa **Ambil ulang** atau **Tetap simpan**.
  Foto yang tetap disimpan dengan peringatan diberi label oranye "*n* catatan".
- **Cap foto**: sudut + paket, nama sekolah + NPSN, wilayah, GPS (± akurasi), hari/tanggal/jam (WIB/WITA/WIT), "progres 0%".
- **Unduh ZIP** berisi folder per paket, nama file memuat tanggal & jam pengambilan:
  ```
  Foto Kondisi Awal - <Nama Sekolah>/
  ├─ Kelas 1/
  │   ├─ 2026-11-03 09.12 - Kelas 1 - Tampak Depan.jpg
  │   └─ ...
  ├─ Ruang guru/
  └─ Penataan lingkungan/
  ```
- **Pemberitahuan versi baru** di bagian atas layar saat aplikasi di Netlify diperbarui.
- **Supabase (opsional, belum aktif)**: cadangan foto otomatis ke internet. Lihat bagian akhir.


## Fitur versi 1.5 (dokumentasi 0% sampai selesai)

- **Tab tahap 0% · 25% · 50% · 75% · 100%**: 4 sudut wajib bangunan (depan, serong kanan 45°, serong kiri 45°, belakang) di setiap tahap.
  Mulai 25%, foto 0% tampil samar di kotak foto dan di layar kamera sebagai acuan posisi. Cap foto menyebut tahapnya.
- **Kamera dengan arahan langsung** (`camera.js`): landscape, lurus, tegak, stabil, cahaya, GPS → "Posisi pas — jepret sekarang!".
- **Tab Kegiatan**: foto kegiatan bebas jumlah dengan keterangan, plus **Video**:
  - *Rekam video di lokasi* (`video.js`): 1280×720, horizon diluruskan otomatis, arahan gerak pelan, cap sekolah/tanggal/jam/GPS tercetak di video, maks. 5 menit.
  - *Video laporan otomatis*: disusun dari foto (perbandingan 0% → 100% per ruang, satu tahap, atau foto kegiatan) dengan judul & label tahap.
- **Unggah ke Drive**: membuka menu Bagikan bawaan HP → pilih Drive → pilih folder. Tidak masuk galeri.

Kunci data: foto 0% `paket|sudut` (sama dengan versi lama), tahap lain `@50|paket|sudut`, kegiatan `#keg|id`, video `#vid|id`.

## Isi folder

| File | Fungsi |
|---|---|
| `index.html`, `style.css` | Halaman & tampilan |
| `app.js` | Alur utama: kamera, cap foto, penyimpanan di HP, ZIP, pembaruan. `APP_VERSION` & `DEFAULT_PAKET` ada di sini |
| `camera.js` | Kamera langsung dengan arahan & sensor kemiringan |
| `video.js` | Rekam video di lokasi & video laporan otomatis |
| `check.js` | Panduan posisi + pemeriksaan foto. Ambang batas di `LIMIT` |
| `zip.js` | Pembuat file ZIP |
| `sw.js` | Agar jalan offline & bisa diperbarui. `VERSION` ada di sini |
| `manifest.webmanifest`, `icons/` | Data pemasangan aplikasi |
| `config.js`, `supabase.js`, `supabase/setup.sql` | Supabase (opsional) |

## Mencoba di laptop (VS Code)

1. **File → Open Folder…** → pilih folder ini.
2. Pasang ekstensi **Live Server** → klik kanan `index.html` → **Open with Live Server**.
   Di laptop, "Ambil foto" membuka pemilih file; pilih foto apa saja untuk mencoba pemeriksaan.

## Merilis versi baru ke Netlify

1. Ubah file yang perlu di VS Code.
2. **Naikkan nomor versi** di dua tempat (wajib, agar HP tahu ada versi baru):
   - `sw.js` → `const VERSION = "1.1.0";` → mis. `"1.1.1"`
   - `app.js` → `const APP_VERSION = "1.1.0 · 3 Nov 2026";` → mis. `"1.1.1 · 10 Nov 2026"`
3. Unggah ke Netlify, pilih salah satu:
   - **Drag & drop:** Netlify → proyek → tab **Deploys** → seret folder ini ke kotak *Drag and drop*.
   - **Lewat GitHub:** push ke repo yang sudah di-*link* di Netlify (Project configuration → Build & deploy → Link repository;
     Build command kosong, Publish directory `/`). Setiap push otomatis terbit.
4. Di HP: buka aplikasi saat ada internet → muncul banner **Versi baru tersedia** → ketuk **Muat ulang**.

> **Khusus pembaruan pertama** dari versi lama (yang belum punya banner): buka aplikasi, tutup sepenuhnya,
> lalu buka lagi (2 kali). Setelah itu pembaruan berikutnya selalu memakai banner.

Foto dan isian yang tersimpan di HP **tidak hilang** saat aplikasi diperbarui, selama alamat Netlify tidak berganti.
Jangan mengganti nama proyek/alamat Netlify selagi masih ada foto yang belum diunduh.

## Mengatur pemeriksaan

Di `check.js`, bagian `LIMIT`:

```js
minSide: 720,     // resolusi minimal (px)
sharp: 50,        // makin besar = makin ketat soal buram
dark: 55,         // di bawah ini = gelap (0–255)
bright: 215,      // di atas ini = silau
twin: 8,          // makin besar = makin mudah dianggap kembar
gpsAcc: 50,       // akurasi GPS maksimal (m)
gpsFar: 500,      // jarak maksimal dari foto lain (m)
oldPhoto: 2 * 36e5 // umur foto galeri maksimal (2 jam)
```

Bila di lapangan terlalu sering muncul "buram" padahal fotonya bagus, turunkan `sharp` (mis. 30).

## Mendapatkan folder di HP

**Unduh semua (.zip)** → buka aplikasi *Files* → *Download* → ketuk ZIP → **Ekstrak** (Android),
atau ketuk ZIP di aplikasi *File* (iPhone).

Foto hanya tersimpan di HP itu. Unduh ZIP secara berkala dan jangan hapus data browser sebelum ZIP terunduh.

## Supabase (opsional)

Untuk cadangan otomatis ke internet atau beberapa HP sekaligus:
1. Supabase → New project (region Singapore) → **SQL Editor** → jalankan `supabase/setup.sql`.
2. **Authentication → Users → Add user** (centang *Auto Confirm*) untuk tiap operator.
3. Isi `config.js` dengan Project URL dan kunci **anon/publishable** (jangan *service_role*).
4. **Authentication → URL Configuration** → *Site URL* = alamat Netlify.
5. Rilis ulang ke Netlify. Panel "Kirim ke Supabase" muncul di aplikasi; foto berlabel *Antre* → *Terkirim*.

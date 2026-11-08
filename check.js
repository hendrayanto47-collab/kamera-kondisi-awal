/* Panduan posisi pengambilan foto + pemeriksaan foto otomatis.
   Semua dihitung di HP, tanpa internet. Menyediakan window.KKA. */
(function () {
  // ---------- Denah posisi (tampak atas) ----------
  // Kotak abu = bangunan/ruangan, garis tebal di bawah bangunan = pintu/teras depan,
  // titik kuning = posisi Anda, kipas kuning = arah kamera.
  const svgWrap = inner =>
    `<svg viewBox="0 0 240 150" role="img" aria-hidden="true" class="plan">${inner}</svg>`;
  const you = (x, y) =>
    `<circle class="g-cam" cx="${x}" cy="${y}" r="7"/><text class="g-lbl g-you" x="${x}" y="${y + 20}" text-anchor="middle">ANDA</text>`;
  const PLAN = {
    depan: svgWrap(
      `<polygon class="g-cone" points="120,128 48,74 192,74"/>
       <rect class="g-bld" x="50" y="18" width="140" height="54" rx="2"/>
       <line class="g-door" x1="104" y1="72" x2="136" y2="72"/>
       <text class="g-lbl" x="120" y="49" text-anchor="middle">BANGUNAN</text>
       <text class="g-lbl g-small" x="120" y="86" text-anchor="middle">pintu</text>
       ${you(120, 122)}`),
    belakang: svgWrap(
      `<polygon class="g-cone" points="120,22 48,76 192,76"/>
       <rect class="g-bld" x="50" y="78" width="140" height="54" rx="2"/>
       <line class="g-door" x1="104" y1="132" x2="136" y2="132"/>
       <text class="g-lbl" x="120" y="109" text-anchor="middle">BANGUNAN</text>
       <text class="g-lbl g-small" x="120" y="146" text-anchor="middle">pintu (di sisi lain)</text>
       <circle class="g-cam" cx="120" cy="18" r="7"/><text class="g-lbl g-you" x="150" y="22">ANDA</text>`),
    samping: svgWrap(
      `<polygon class="g-cone" points="214,75 158,24 158,126"/>
       <rect class="g-bld" x="20" y="40" width="136" height="70" rx="2"/>
       <line class="g-door" x1="72" y1="110" x2="104" y2="110"/>
       <text class="g-lbl" x="88" y="79" text-anchor="middle">BANGUNAN</text>
       <text class="g-lbl g-small" x="88" y="124" text-anchor="middle">pintu</text>
       <circle class="g-cam" cx="218" cy="75" r="7"/><text class="g-lbl g-you" x="218" y="98" text-anchor="middle">ANDA</text>`),
    serongkanan: svgWrap(
      `<polygon class="g-cone" points="214,136 70,70 176,4"/>
       <rect class="g-bld" x="34" y="20" width="140" height="54" rx="2"/>
       <line class="g-door" x1="88" y1="74" x2="120" y2="74"/>
       <text class="g-lbl" x="104" y="51" text-anchor="middle">BANGUNAN</text>
       <text class="g-lbl g-small" x="104" y="88" text-anchor="middle">pintu (depan)</text>
       <line class="g-diag" x1="174" y1="74" x2="214" y2="114"/>
       <text class="g-lbl g-small" x="196" y="84">45°</text>
       <circle class="g-cam" cx="214" cy="120" r="7"/><text class="g-lbl g-you" x="214" y="143" text-anchor="middle">ANDA</text>`),
    serongkiri: svgWrap(
      `<polygon class="g-cone" points="26,136 170,70 64,4"/>
       <rect class="g-bld" x="66" y="20" width="140" height="54" rx="2"/>
       <line class="g-door" x1="120" y1="74" x2="152" y2="74"/>
       <text class="g-lbl" x="136" y="51" text-anchor="middle">BANGUNAN</text>
       <text class="g-lbl g-small" x="136" y="88" text-anchor="middle">pintu (depan)</text>
       <line class="g-diag" x1="66" y1="74" x2="26" y2="114"/>
       <text class="g-lbl g-small" x="30" y="84">45°</text>
       <circle class="g-cam" cx="26" cy="120" r="7"/><text class="g-lbl g-you" x="26" y="143" text-anchor="middle">ANDA</text>`),
    ruang: svgWrap(
      `<rect class="g-room" x="40" y="10" width="160" height="128" rx="2"/>
       <polygon class="g-cone" points="54,124 132,10 200,10 200,72"/>
       <line class="g-gap" x1="62" y1="138" x2="92" y2="138"/>
       <text class="g-lbl g-small" x="77" y="149" text-anchor="middle">pintu</text>
       <text class="g-lbl" x="150" y="100" text-anchor="middle">RUANGAN</text>
       <circle class="g-cam" cx="54" cy="124" r="7"/><text class="g-lbl g-you" x="22" y="118" text-anchor="middle">ANDA</text>`),
  };

  const COMMON = [
    "WAJIB landscape: miringkan HP (horizontal). Foto portrait (tegak) tidak diterima.",
    "Ambil siang hari dengan cahaya alami yang terang.",
    "Jangan pakai zoom. Mundur atau maju sampai objek pas di layar.",
    "Pastikan tidak ada orang atau siswa yang menutupi bangunan.",
  ];
  const GUIDE = {
    depan: {
      tips: [
        "Berdiri di halaman, menghadap pintu masuk atau teras.",
        "Mundur ±10–15 m sampai seluruh bangunan, atap, dan pondasi masuk bingkai.",
        "Papan nama atau nomor ruang sebaiknya terlihat.",
      ],
    },
    belakang: {
      tips: [
        "Pindah ke sisi belakang bangunan, berlawanan dengan pintu masuk.",
        "Seluruh dinding belakang dan atap masuk bingkai.",
        "Tampilkan kerusakan yang ada: retak, jamur, talang, atau atap bocor.",
      ],
    },
    serongkanan: {
      tips: [
        "Berdiri di depan-kanan bangunan, segaris diagonal dengan pojok depan kanan (±45°).",
        "Dinding depan dan dinding samping kanan terlihat bersamaan; pojok bangunan di tengah foto.",
        "Mundur sampai seluruh bangunan dan atap masuk bingkai.",
      ],
    },
    serongkiri: {
      tips: [
        "Berdiri di depan-kiri bangunan, segaris diagonal dengan pojok depan kiri (±45°).",
        "Dinding depan dan dinding samping kiri terlihat bersamaan; pojok bangunan di tengah foto.",
        "Mundur sampai seluruh bangunan dan atap masuk bingkai.",
      ],
    },
    samping: {
      tips: [
        "Slot ini dari versi lama. Ambil ulang foto ini di slot Serong Kanan 45° atau Serong Kiri 45°.",
        "Berdiri di ujung bangunan (kiri atau kanan).",
        "Dinding samping terlihat dari ujung ke ujung, beserta atap dan pondasi.",
        "Ambil sisi yang kerusakannya paling terlihat.",
      ],
    },
    ruang: {
      tips: [
        "Foto tambahan, tidak termasuk 4 foto wajib bangunan.",
        "Masuk ke ruangan, berdiri di pojok dekat pintu.",
        "Arahkan diagonal ke pojok seberang: lantai, dinding, dan plafon masuk satu foto.",
        "Nyalakan lampu atau buka jendela bila ruangan gelap.",
      ],
    },
  };

  // ---------- Analisis gambar ----------
  function analyze(img) {
    const W0 = img.width, H0 = img.height;
    // Ketajaman & kecerahan dihitung pada versi 1024 px (sisi terpanjang)
    const sc = Math.min(1, 1024 / Math.max(W0, H0));
    const w = Math.max(1, Math.round(W0 * sc)), h = Math.max(1, Math.round(H0 * sc));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      g[j] = v; sum += v;
    }
    const bright = sum / (w * h);
    // Varians Laplacian: makin kecil makin buram
    let n = 0, m = 0, m2 = 0;
    for (let yy = 1; yy < h - 1; yy++) {
      for (let xx = 1; xx < w - 1; xx++) {
        const i = yy * w + xx;
        const lap = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
        n++; const dlt = lap - m; m += dlt / n; m2 += dlt * (lap - m);
      }
    }
    const sharp = n > 1 ? m2 / (n - 1) : 0;
    return { w: W0, h: H0, bright, sharp, hash: dhash(img) };
  }

  // Sidik jari gambar (dHash 64 bit) untuk mendeteksi foto kembar
  function dhash(img) {
    const c = document.createElement("canvas"); c.width = 9; c.height = 8;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, 9, 8);
    const d = x.getImageData(0, 0, 9, 8).data;
    let bits = "";
    for (let y = 0; y < 8; y++) {
      for (let xx = 0; xx < 8; xx++) {
        const a = (y * 9 + xx) * 4, b = a + 4;
        const ga = d[a] * 0.299 + d[a + 1] * 0.587 + d[a + 2] * 0.114;
        const gb = d[b] * 0.299 + d[b + 1] * 0.587 + d[b + 2] * 0.114;
        bits += ga > gb ? "1" : "0";
      }
    }
    return bits;
  }
  function hamming(a, b) {
    if (!a || !b || a.length !== b.length) return 64;
    let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
  }
  function distanceM(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  const median = arr => { const s = arr.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  function ago(ms) {
    const h = ms / 36e5;
    return h < 48 ? `${Math.round(h)} jam` : `${Math.round(h / 24)} hari`;
  }

  // Ambang batas (bisa disesuaikan setelah uji lapangan)
  const LIMIT = {
    minSide: 720,     // px, sisi terpendek minimal
    sharp: 50,        // varians Laplacian (pada 1024 px) di bawah ini = kemungkinan buram
    dark: 55,         // rata-rata kecerahan 0–255
    bright: 215,
    twin: 8,          // beda sidik jari ≤ 8 dari 64 = foto kembar
    gpsAcc: 50,       // m
    gpsFar: 500,      // m dari lokasi foto lain
    oldPhoto: 2 * 36e5, // 2 jam
  };

  /* Hasil: [{ok:boolean, text, block?}] — ok:false = peringatan; block:true = tidak boleh disimpan */
  function runChecks({ info, takenAt, gps, others }) {
    const out = [];
    const add = (ok, text, block) => out.push({ ok, text, block: !!block });

    // 1. Orientasi — wajib landscape sesuai ketentuan Form Unggah Dokumentasi 0%
    if (info.h > info.w) add(false, "Foto portrait (tegak) tidak diperkenankan. Miringkan HP (landscape) lalu ambil ulang.", true);
    else add(true, "Landscape");

    // 2. Ketajaman
    if (info.sharp < LIMIT.sharp) add(false, "Foto tampak buram atau goyang. Pegang HP dengan dua tangan, ketuk layar untuk fokus.");
    else add(true, "Foto tajam");

    // 3. Cahaya
    if (info.bright < LIMIT.dark) add(false, "Foto terlalu gelap. Nyalakan lampu, buka jendela, atau foto saat siang.");
    else if (info.bright > LIMIT.bright) add(false, "Foto terlalu terang atau silau. Hindari memotret melawan matahari.");
    else add(true, "Pencahayaan cukup");

    // 4. Resolusi
    if (Math.min(info.w, info.h) < LIMIT.minSide)
      add(false, `Resolusi rendah (${info.w}×${info.h}). Gunakan kamera utama, bukan tangkapan layar.`);

    // 5. Foto kembar
    let twin = null, best = 64;
    for (const o of others) {
      const dist = hamming(info.hash, o.hash);
      if (dist < best) { best = dist; twin = o; }
    }
    if (twin && best <= LIMIT.twin) add(false, `Sangat mirip dengan foto "${twin.label}". Pastikan ini sudut yang berbeda.`);
    else add(true, "Tidak ada foto kembar");

    // 6. Waktu pengambilan
    const age = Date.now() - takenAt;
    if (age > LIMIT.oldPhoto) add(false, `Foto ini dibuat ${ago(age)} lalu (dari galeri), bukan baru dipotret.`);

    // 7. GPS
    if (!gps) add(false, "GPS tidak aktif dan koordinat sekolah belum diisi. Koordinat tidak tercetak di foto.");
    else if (gps.src === "sekolah")
      add(false, `GPS HP ${gps.phoneAcc ? "tidak akurat (±" + gps.phoneAcc + " m)" : "belum terkunci"}; dicetak koordinat sekolah.`);
    else if (gps.acc > LIMIT.gpsAcc) add(false, `Akurasi GPS rendah (±${gps.acc} m). Tunggu sebentar di area terbuka.`);
    else {
      const pts = others.filter(o => o.lat != null);
      if (pts.length) {
        const ref = { lat: median(pts.map(o => o.lat)), lng: median(pts.map(o => o.lng)) };
        const far = distanceM(ref, gps);
        if (far > LIMIT.gpsFar) {
          add(false, `Lokasi ${far >= 1000 ? (far / 1000).toFixed(1) + " km" : Math.round(far) + " m"} dari foto lain. Pastikan masih di sekolah yang sama.`);
        } else add(true, `GPS ±${gps.acc} m`);
      } else add(true, `GPS ±${gps.acc} m`);
    }
    return out;
  }

  window.KKA = { PLAN, GUIDE, COMMON, analyze, runChecks, LIMIT };
})();

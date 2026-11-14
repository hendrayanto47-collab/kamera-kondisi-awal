/* Video: (1) rekam video di lokasi dengan arahan & cap, (2) video laporan otomatis dari foto.
   Keduanya digambar ke kanvas 1280×720 (landscape) lalu direkam dengan MediaRecorder,
   sehingga cap sekolah/tanggal/GPS tercetak langsung di video.
   Menyediakan window.KKAVid. */
(function () {
  const $ = id => document.getElementById(id);
  let W = 1280, H = 720; const FPS = 30; // ukuran bingkai rekaman: Full HD bila kamera mendukung, selain itu HD
  const MAX_SEC = 5 * 60; // batas rekaman agar file tidak terlalu besar
  const two = n => String(n).padStart(2, "0");
  const mmss = s => `${two(Math.floor(s / 60))}:${two(Math.floor(s % 60))}`;

  function pickMime() {
    if (!window.MediaRecorder) return null;
    const c = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4",
      "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    return c.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || "";
  }
  function supported() {
    const cv = document.createElement("canvas");
    return !!(window.MediaRecorder && cv.captureStream && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
  }
  const extOf = mime => (/mp4/.test(mime) ? "mp4" : "webm");

  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) {}
  }

  // ---------- Cap di video (pita bawah, mirip cap foto) ----------
  function drawStamp(x, title, lines, tag) {
    const pad = 16, left = 26, tFs = 28, bFs = 19, lh = 26;
    const bandH = pad * 2 + 32 + lh * lines.length, top = H - bandH;
    const gr = x.createLinearGradient(0, top - 24, 0, H);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.25, "rgba(0,0,0,.62)"); gr.addColorStop(1, "rgba(0,0,0,.8)");
    x.fillStyle = gr; x.fillRect(0, top - 24, W, bandH + 24);
    x.fillStyle = "#f2b705"; x.fillRect(0, top + pad * 0.6, 6, bandH - pad * 1.2);
    x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 3;
    x.textAlign = "left"; x.font = `800 ${tFs}px Arial, sans-serif`; x.fillStyle = "#f2b705";
    let y = top + pad + tFs;
    x.fillText(title, left, y, W - left - 380);
    if (tag) { x.font = "700 15px Arial, sans-serif"; x.fillStyle = "rgba(255,255,255,.85)"; x.textAlign = "right"; x.fillText(tag, W - pad, y); x.textAlign = "left"; }
    x.font = `500 ${bFs}px Arial, sans-serif`; x.fillStyle = "#fff";
    y += 4;
    for (const l of lines) { y += lh; x.fillText(l, left, y - 6, W - left - pad); }
    x.shadowBlur = 0;
  }

  // ================= (1) REKAM VIDEO DI LOKASI =================
  let rec = null; // {stream, recorder, chunks, canvas, timer, t0, opts, audio}
  const S = () => window.KKASensor;

  async function openRecorder(o) {
    if (!supported()) { o.onUnsupported(); return; }
    rec = { opts: o, chunks: [], level: 0, recording: false };
    const sensorP = S() ? S().start() : Promise.resolve();
    $("vr").hidden = false; document.documentElement.classList.add("vf-open");
    $("vrTitle").textContent = (o.titleFn ? o.titleFn() : o.title).toUpperCase();
    showShot(o);
    setMsg("wait", "Membuka kamera…"); setRecUI(false);
    let stream;
    const hq = o.quality !== "720";
    const video = { facingMode: { ideal: "environment" }, width: { ideal: hq ? 1920 : 1280 }, height: { ideal: hq ? 1080 : 720 }, frameRate: { ideal: 30 } };
    try { stream = await navigator.mediaDevices.getUserMedia({ video, audio: o.audio }); }
    catch (e) {
      if (o.audio) { try { stream = await navigator.mediaDevices.getUserMedia({ video, audio: false }); o.audio = false; } catch (e2) {} }
    }
    if (!stream) { closeRecorder(); o.onError("Kamera tidak bisa dibuka. Periksa izin kamera."); return; }
    await sensorP;
    rec.stream = stream;
    const v = $("vrVideo"); v.srcObject = stream; v.muted = true;
    try { await v.play(); } catch (e) {}
    await new Promise(r => (v.videoWidth ? r() : v.addEventListener("loadedmetadata", r, { once: true })));
    // Full HD hanya bila kamera benar-benar memberi ≥1080p (tidak memperbesar gambar kecil)
    { const big = Math.max(v.videoWidth, v.videoHeight), small = Math.min(v.videoWidth, v.videoHeight);
      if (hq && big >= 1900 && small >= 1060) { W = 1920; H = 1080; } else { W = 1280; H = 720; } }
    rec.hq = W === 1920;
    rec.canvas = $("vrCanvas"); rec.canvas.width = W; rec.canvas.height = H;
    rec.ctx = rec.canvas.getContext("2d");
    // Mode "both": selain video bercap, salinan bingkai tanpa cap direkam bersamaan (dua file dari satu rekaman)
    rec.mode = o.stampMode || "stamp";
    if (rec.mode === "both") { rec.plain = document.createElement("canvas"); rec.plain.width = W; rec.plain.height = H; rec.pctx = rec.plain.getContext("2d"); }
    keepAwake(true);
    const loop = () => { if (!rec) return; drawFrame(); rec.raf = requestAnimationFrame(loop); };
    loop();
    rec.guideTimer = setInterval(guide, 250);
    refreshOverlay(); rec.ovTimer = setInterval(refreshOverlay, 1000);
  }

  // Gambar satu bingkai: putar menurut posisi HP, luruskan horizon, beri cap
  function drawFrame() {
    const v = $("vrVideo"), x = rec.ctx; if (!v.videoWidth) return;
    const s = S(), p = s ? s.pose() : null, turn = s ? s.frameRotation(p) : 0;
    // Horizon lurus otomatis (maks ±10°). Sensor gravitasi ikut terguncang getaran tangan, jadi:
    // - diperhalus berbasis waktu (pratinjau ±0,6 dtk; saat merekam ±3 dtk) dan ada zona mati,
    // - tidak diubah selama HP sedang digerakkan/digeser cepat (giroskop tinggi),
    // sehingga gambar tidak ikut bergoyang-putar. Bisa dimatikan di Pengaturan.
    const now = performance.now(), dt = Math.min(0.1, (now - (rec.lt || now)) / 1000); rec.lt = now;
    const hl = rec.opts.horizon !== false;
    const want = hl && p && Math.abs(p.level) < 10 ? -p.level : 0;
    const moving = s && s.shake && s.shake() > 20;
    const tau = rec.recording ? 3 : 0.6, dead = rec.recording ? 1.5 : 0.3;
    const diff = want - rec.level;
    if (!hl) rec.level = 0;
    else if (!moving && Math.abs(diff) > dead) rec.level += diff * (1 - Math.exp(-dt / tau));
    const vw = v.videoWidth, vh = v.videoHeight, sw = turn % 180 !== 0;
    const fw = sw ? vh : vw, fh = sw ? vw : vh;           // ukuran bingkai setelah diputar
    const zoom = hl ? 1.12 : 1;                            // potong tepi agar sudut kosong tidak terlihat saat diluruskan
    const sc = Math.max(W / fw, H / fh) * zoom;
    x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
    x.save(); x.translate(W / 2, H / 2);
    x.rotate((turn + rec.level) * Math.PI / 180);
    x.drawImage(v, -vw * sc / 2, -vh * sc / 2, vw * sc, vh * sc);
    x.restore();
    if (rec.pctx) rec.pctx.drawImage(rec.canvas, 0, 0); // versi polos: bingkai sebelum cap ditempel
    // Cap (disiapkan sekali per detik di refreshOverlay) ditempel di bagian bawah setiap bingkai
    if (rec.overlay && rec.mode !== "plain") x.drawImage(rec.overlay, 0, H - rec.overlay.height);
    // Pratinjau: kanvas diputar agar tampak tegak bagi operator yang memegang HP miring
    const cv = rec.canvas, wrap = $("vr");
    const vwp = wrap.clientWidth, vhp = wrap.clientHeight - 150;
    const cssTurn = (360 - turn) % 360, side = cssTurn % 180 !== 0;
    const k = side ? Math.min(vhp / W, vwp / H) : Math.min(vwp / W, vhp / H);
    cv.style.width = W * k + "px"; cv.style.height = H * k + "px";
    cv.style.transform = `translate(-50%,-50%) rotate(${cssTurn}deg)`;
    $("vrHint").dataset.turn = String(cssTurn);
  }

  /* Cap video bergaya sama dengan cap foto "Lengkap":
     peta mini + judul + alamat + Lat/Long & Plus Code + tanggal/jam berjalan + identitas sekolah. */
  async function refreshOverlay() {
    if (!rec || rec.busyOverlay) return;
    rec.busyOverlay = true;
    try {
      const o = rec.opts, now = new Date(), g = o.gps ? o.gps() : null;
      const oh = Math.round(300 * H / 720);
      const cv = rec.ovBuf || (rec.ovBuf = document.createElement("canvas"));
      cv.width = W; cv.height = oh;
      const x = cv.getContext("2d"); x.clearRect(0, 0, W, oh);
      if (g && window.KKAGeo) {
        const addr = o.address ? o.address(g) : "";
        await KKAGeo.drawCard(x, W, oh, { u: H / 720, lat: g.lat, lng: g.lng, acc: g.acc, src: g.src, addr, fallbackHead: addr || "Indonesia",
          when: now, seconds: true, note: `${o.title} · ${o.idLine} · Video dokumentasi revitalisasi`, app: "Kamera Revit SD" });
      } else {
        x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(14, oh - 60, W - 28, 46);
        x.fillStyle = "#fff"; x.font = "600 18px Arial, sans-serif"; x.fillText(`${o.title} · GPS tidak tersedia · ${now.toLocaleString("id-ID")}`, 28, oh - 30);
      }
      const show = rec.overlay && rec.overlay !== cv ? rec.overlay : document.createElement("canvas");
      rec.ovBuf = show; rec.overlay = cv;
    } catch (e) {}
    if (rec) rec.busyOverlay = false;
  }

  // Arahan sudut pengambilan (video per ruangan): gambar denah kecil + kalimat petunjuk
  function showShot(o) {
    const sh = o.shotFn ? o.shotFn() : null;
    $("vrShot").hidden = !sh;
    if (!sh) return;
    $("vrFig").innerHTML = (window.KKA && KKA.PLAN[sh.fig]) || "";
    $("vrShotD").textContent = sh.d;
  }
  function setMsg(state, msg) { $("vrMsg").textContent = msg; $("vr").dataset.state = state; }
  function guide() {
    if (!rec || !rec.ctx) return;
    const s = S(), p = s ? s.pose() : null;
    // Landscape dinilai dari posisi HP (sensor), bukan ukuran gambar kamera — hasil video selalu 1280×720
    const landscape = p ? Math.abs(p.snapped) === 90 : true;
    const shake = s && s.seen() ? s.shake() : 0;
    const chips = [
      { l: "Landscape", ok: landscape }, { l: "Horizon lurus", ok: !p || Math.abs(p.level) < 12 },
      { l: "Gerak pelan", ok: shake <= 35 }, { l: "Tegak", ok: !p || Math.abs(p.pitch) <= 30 },
    ];
    $("vrChips").innerHTML = chips.map(c => `<span class="vc ${c.ok ? "ok" : "no"}">${c.l}</span>`).join("");
    let st = "go", m;
    if (!landscape) { st = "no"; m = "Miringkan HP ke posisi mendatar (landscape)."; }
    else if (shake > 35) { st = "no"; m = "Terlalu cepat. Gerakkan HP lebih pelan."; }
    else if (p && Math.abs(p.level) >= 12) { st = "no"; m = "HP terlalu miring. Tegakkan sedikit."; }
    else if (p && Math.abs(p.pitch) > 30) { st = "no"; m = p.pitch > 0 ? "HP terlalu menunduk." : "HP terlalu mendongak."; }
    else {
      const min = rec.opts.minSec || 0, el = rec.recording ? (Date.now() - rec.t0) / 1000 : 0;
      m = !rec.recording ? "Siap merekam. Ketuk tombol merah."
        : rec.opts.shotFn && el < 2 ? "Tahan diam sebentar…" : min && el < min ? `Geser pelan — minimal ${min} detik.` : rec.opts.maxSec ? "Bagus. Berhenti sendiri di " + rec.opts.maxSec + " detik." : "Bagus — terus berjalan pelan.";
    }
    setMsg(st, m);
    if (rec.recording) {
      const sec = (Date.now() - rec.t0) / 1000;
      const max = rec.opts.maxSec || MAX_SEC, min = rec.opts.minSec || 0;
      $("vrTime").textContent = "● " + mmss(sec) + " / " + mmss(max) + (min && sec < min ? ` · min ${min} dtk` : "");
      if (sec >= max) stopRec();
    }
  }

  function setRecUI(on) {
    $("vrRec").classList.toggle("on", on);
    $("vrRec").setAttribute("aria-label", on ? "Berhenti merekam" : "Mulai merekam");
    $("vrTime").hidden = !on; $("vrClose").disabled = on;
  }
  function makeRecorder(canvas, audio) {
    const mime = pickMime();
    const cs = canvas.captureStream(FPS);
    if (audio) rec.stream.getAudioTracks().forEach(t => cs.addTrack(audio === "clone" ? t.clone() : t));
    let r;
    // Kualitas: Full HD 8 Mbps (6 Mbps per file bila dua versi sekaligus), HD 4 Mbps
    const bps = rec.hq ? (rec.plain ? 6000000 : 8000000) : 4000000;
    try { r = new MediaRecorder(cs, mime ? { mimeType: mime, videoBitsPerSecond: bps } : { videoBitsPerSecond: bps }); }
    catch (e) { r = new MediaRecorder(cs); }
    const out = { r, cs, chunks: [], mime: r.mimeType || mime || "video/webm" };
    r.ondataavailable = e => { if (e.data && e.data.size) out.chunks.push(e.data); };
    out.done = new Promise(res => (r.onstop = () => {
      cs.getTracks().forEach(t => { if (t.kind === "video" || audio === "clone") t.stop(); });
      res(new Blob(out.chunks, { type: out.mime.split(";")[0] }));
    }));
    return out;
  }
  function startRec() {
    const a = rec.opts.audio;
    const main = makeRecorder(rec.canvas, a ? "share" : null);
    const plain = rec.plain ? makeRecorder(rec.plain, a ? "clone" : null) : null;
    rec.mime = main.mime;
    Promise.all([main.done, plain ? plain.done : null]).then(async ([blob, pblob]) => {
      const dur = Math.min((Date.now() - rec.t0) / 1000, rec.opts.maxSec || MAX_SEC), o = rec.opts;
      // susun ulang agar durasi terbaca & bisa digeser di galeri/WhatsApp/Drive
      if (window.KKAFix) { blob = await KKAFix.fix(blob, dur); if (pblob) pblob = await KKAFix.fix(pblob, dur); }
      const v = { blob, mime: blob.type, dur, t: Date.now() - dur * 1000, ext: extOf(blob.type) };
      if (pblob && pblob.size) v.plain = pblob;
      if (rec.mode === "plain") v.nostamp = true;
      if (o.multi) { // klip pendek berturut-turut: kamera tetap terbuka untuk klip berikutnya
        o.onSaved(v);
        if (o.titleFn) $("vrTitle").textContent = o.titleFn().toUpperCase();
        showShot(o);
        return;
      }
      closeRecorder(); o.onSaved(v);
    });
    main.r.start(1000); if (plain) plain.r.start(1000);
    rec.recorder = main.r; rec.recorder2 = plain ? plain.r : null; rec.recording = true; rec.t0 = Date.now();
    setRecUI(true);
  }
  function stopRec() {
    if (!rec || !rec.recording) return;
    const min = rec.opts.minSec || 0, sec = (Date.now() - rec.t0) / 1000;
    if (min && sec < min) { setMsg("no", `Terus rekam — minimal ${min} detik (baru ${Math.floor(sec)} dtk).`); return; }
    rec.recording = false; setRecUI(false);
    setMsg("wait", "Menyimpan video…");
    try { rec.recorder.stop(); } catch (e) {}
    try { if (rec.recorder2) rec.recorder2.stop(); } catch (e) {}
  }
  function closeRecorder() {
    if (!rec) return;
    cancelAnimationFrame(rec.raf); clearInterval(rec.guideTimer); clearInterval(rec.ovTimer);
    if (rec.stream) rec.stream.getTracks().forEach(t => t.stop());
    if (S()) S().stop();
    $("vrVideo").srcObject = null;
    $("vr").hidden = true; document.documentElement.classList.remove("vf-open");
    keepAwake(false);
    rec = null;
  }
  $("vrRec").addEventListener("click", () => { if (!rec || !rec.ctx) return; rec.recording ? stopRec() : startRec(); });
  $("vrClose").addEventListener("click", () => { if (rec && !rec.recording) closeRecorder(); });

  // ================= (2) VIDEO LAPORAN OTOMATIS DARI FOTO =================
  /* scenes: [{type:"title", title, sub, lines}] | [{type:"photo", blob, label, badge, sec}]
     Dirender waktu-nyata ke kanvas lalu direkam (durasi render = durasi video). */
  let mk = null;
  async function makeReport(scenes, o) {
    W = 1280; H = 720;
    if (!supported()) { o.onError("HP/browser ini belum mendukung pembuatan video."); return; }
    mk = { cancel: false };
    const cv = $("mkCanvas"); cv.width = W; cv.height = H;
    const x = cv.getContext("2d");
    $("mk").hidden = false; document.documentElement.classList.add("vf-open");
    keepAwake(true);
    // Siapkan gambar
    $("mkMsg").textContent = "Menyiapkan foto & video…";
    // Klip video: diputar waktu-nyata ke kanvas; suaranya ikut direkam lewat Web Audio (tidak terdengar di speaker)
    let ac = null, dest = null;
    if (scenes.some(s => s.type === "clip")) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); dest = ac.createMediaStreamDestination(); } catch (e) { ac = null; }
    }
    for (const s of scenes) {
      if (s.type === "clip") {
        const v = document.createElement("video");
        v.playsInline = true; v.preload = "auto"; v.src = s.url = URL.createObjectURL(s.blob);
        await new Promise(res => { v.onloadeddata = res; v.onerror = res; setTimeout(res, 4000); });
        if (ac) { try { ac.createMediaElementSource(v).connect(dest); } catch (e) { v.muted = true; } } else v.muted = true;
        s.vid = v;
      } else if (s.blob) s.img = await createImageBitmap(s.blob);
    }
    const FADE = 0.5;
    const total = scenes.reduce((a, s) => a + s.sec, 0);
    const mime = pickMime();
    const cs = cv.captureStream(FPS);
    if (dest) dest.stream.getAudioTracks().forEach(t => cs.addTrack(t));
    let r;
    try { r = new MediaRecorder(cs, mime ? { mimeType: mime, videoBitsPerSecond: 3000000 } : {}); } catch (e) { r = new MediaRecorder(cs); }
    const chunks = [];
    r.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => (r.onstop = res));
    const starts = []; let acc = 0; for (const s of scenes) { starts.push(acc); acc += s.sec; }

    function paintScene(s, t, alpha) {
      x.globalAlpha = alpha;
      if (s.type === "title") {
        x.fillStyle = "#1d2421"; x.fillRect(0, 0, W, H);
        x.fillStyle = "#f2b705"; x.fillRect(80, 250, 10, 220);
        x.textAlign = "left"; x.fillStyle = "#f2b705"; x.font = "800 30px Arial, sans-serif";
        x.fillText(s.kicker || "", 120, 290, W - 200);
        x.fillStyle = "#fff"; x.font = "800 64px Arial, sans-serif";
        x.fillText(s.title, 120, 370, W - 200);
        x.font = "500 28px Arial, sans-serif"; x.fillStyle = "#d6dbd8";
        (s.lines || []).forEach((l, i) => x.fillText(l, 120, 425 + i * 40, W - 200));
      } else {
        x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
        if (s.type === "clip") {
          const v = s.vid, vw = v.videoWidth, vh = v.videoHeight;
          if (vw) { const sc = Math.min(W / vw, H / vh); x.drawImage(v, (W - vw * sc) / 2, (H - vh * sc) / 2, vw * sc, vh * sc); }
        } else {
          const im = s.img, zoom = 1 + 0.05 * (t / s.sec); // gerak perlahan (Ken Burns)
          const sc = Math.max(W / im.width, H / im.height) * zoom;
          x.drawImage(im, (W - im.width * sc) / 2, (H - im.height * sc) / 2, im.width * sc, im.height * sc);
        }
        if (s.badge) {
          x.font = "800 34px Arial, sans-serif"; const bw = x.measureText(s.badge).width + 40;
          x.fillStyle = s.badgeColor || "#f2b705"; x.fillRect(40, 40, bw, 58);
          x.fillStyle = "#1d2421"; x.textAlign = "left"; x.fillText(s.badge, 60, 82);
        }
        if (s.label) {
          x.font = "700 24px Arial, sans-serif"; const lw = x.measureText(s.label).width + 32;
          x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(40, 108, lw, 42);
          x.fillStyle = "#fff"; x.fillText(s.label, 56, 138);
        }
      }
      x.globalAlpha = 1;
    }

    if (ac && ac.state === "suspended") { try { await ac.resume(); } catch (e) {} }
    let cur = -1;
    r.start(1000);
    const t0 = performance.now();
    await new Promise(resolve => {
      const tick = () => {
        if (mk.cancel) return resolve();
        const now = (performance.now() - t0) / 1000;
        if (now >= total) return resolve();
        let i = starts.findIndex((st, j) => now >= st && now < st + scenes[j].sec);
        if (i < 0) i = scenes.length - 1;
        const s = scenes[i], local = now - starts[i];
        if (i !== cur) { // pindah adegan: hentikan klip sebelumnya, putar klip ini dari awal
          const prev = scenes[cur]; if (prev && prev.vid) prev.vid.pause();
          cur = i;
          if (s.vid) { try { s.vid.currentTime = s.start || 0; } catch (e) {} s.vid.play().catch(() => { s.vid.muted = true; s.vid.play().catch(() => {}); }); }
        }
        paintScene(s, local, 1);
        if (local < FADE && i > 0) paintScene(scenes[i - 1], scenes[i - 1].sec, 1 - local / FADE);
        $("mkBar").style.width = (now / total * 100).toFixed(1) + "%";
        $("mkMsg").textContent = `Membuat video… ${mmss(now)} / ${mmss(total)} (biarkan layar tetap menyala)`;
        requestAnimationFrame(tick);
      };
      tick();
    });
    r.stop(); await done;
    scenes.forEach(s => { if (s.vid) { s.vid.pause(); s.vid.removeAttribute("src"); URL.revokeObjectURL(s.url); } });
    if (ac) ac.close().catch(() => {});
    keepAwake(false);
    $("mk").hidden = true; document.documentElement.classList.remove("vf-open");
    const cancelled = mk.cancel; mk = null;
    if (cancelled) { o.onError("Pembuatan video dibatalkan."); return; }
    const type = (r.mimeType || mime || "video/webm").split(";")[0];
    let blob = new Blob(chunks, { type });
    if (window.KKAFix) blob = await KKAFix.fix(blob, total);
    o.onSaved({ blob, mime: type, dur: total, t: Date.now(), ext: extOf(type) });
  }
  $("mkCancel").addEventListener("click", () => { if (mk) mk.cancel = true; });

  window.KKAVid = { _level: () => rec && rec.level, supported, openRecorder, makeReport, pickMime };
})();

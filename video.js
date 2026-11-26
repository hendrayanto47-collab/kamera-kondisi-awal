/* Video: (1) rekam video di lokasi dengan arahan & cap, (2) video laporan otomatis dari foto.
   Keduanya digambar ke kanvas 1280×720 (landscape) lalu direkam dengan MediaRecorder,
   sehingga cap sekolah/tanggal/GPS tercetak langsung di video.
   Menyediakan window.KKAVid. */
(function () {
  const $ = id => document.getElementById(id);
  let W = 1280, H = 720; const FPS = 30;
  let vrZoom = null; // ukuran bingkai rekaman: Full HD bila kamera mendukung, selain itu HD
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
    rec.dz = 1;
    if (!vrZoom && window.KKAZoom) vrZoom = KKAZoom.make("vrZoom", "vrVideo", "vr");
    if (vrZoom) vrZoom.attach(stream.getVideoTracks()[0], { onDigital: z => { if (rec) rec.dz = z; }, digitalMax: 3 });
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
    const zoom = (hl ? 1.12 : 1) * (rec.dz || 1);         // potong tepi (pelurusan) × zoom digital bila kamera tak punya zoom
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
          when: now, seconds: true, quick: true, note: `${o.title} · ${o.idLine} · Video dokumentasi revitalisasi`, app: "Kamera Revit SD" });
      } else {
        x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(14, oh - 60, W - 28, 46);
        x.fillStyle = "#fff"; x.font = "600 18px Arial, sans-serif"; x.fillText(`${o.title} · GPS tidak tersedia · ${now.toLocaleString("id-ID")}`, 28, oh - 30);
      }
      const show = rec.overlay && rec.overlay !== cv ? rec.overlay : document.createElement("canvas");
      rec.ovBuf = show; rec.overlay = cv;
    } catch (e) {} // cap gagal diperbarui sesaat tidak menghentikan rekaman
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
    if (vrZoom) vrZoom.reset();
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
  /* ---------- Musik latar bawaan (dibuat langsung oleh aplikasi, bebas hak cipta) ----------
     Tiga gaya: semangat (ceria, ada ketukan), tenang (lembut), megah (sinematik).
     Dijadwalkan sedikit demi sedikit mengikuti jam AudioContext: bila AudioContext dijeda, musik ikut berhenti. */
  const MUSIC = {
    semangat: { bpm: 112, root: 60, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], pad: "triangle", drums: "pop", arp: [0, 1, 2, 1, 0, 2, 1, 2], bass: "drive" },
    tenang: { bpm: 74, root: 60, gain: 1.7, prog: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]], pad: "sine", drums: "soft", arp: [0, 2, 1, 3, 2, 1, 3, 2], bass: "half" },
    megah: { bpm: 84, root: 57, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], pad: "sawtooth", drums: "epic", arp: [0, 0, 1, 0, 2, 0, 1, 0], bass: "long" },
  };
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  function makeMusicGen(ac, out, style) {
    const S = MUSIC[style] || MUSIC.semangat, beat = 60 / S.bpm;
    { const mst = ac.createGain(); mst.gain.value = S.gain || 1; mst.connect(out); out = mst; }
    const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // gema sederhana untuk pad & arpeggio
    const ir = ac.createBuffer(2, ac.sampleRate * 2.2, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
    const rev = ac.createConvolver(); rev.buffer = ir; const revG = ac.createGain(); revG.gain.value = 0.35; rev.connect(revG).connect(out);
    const dry = ac.createGain(); dry.gain.value = 1; dry.connect(out);
    const send = (node, wet) => { node.connect(dry); if (wet) { const g = ac.createGain(); g.gain.value = wet; node.connect(g).connect(rev); } };
    const note = (type, m, t, dur, peak, att = 0.01, wet = 0, cut = 0) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = mf(m);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let n = o.connect(g); if (cut) { const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cut; n = g.connect(f); }
      send(n, wet); o.start(t); o.stop(t + dur + 0.05);
    };
    const hit = (t, dur, peak, type, freq) => { const n = ac.createBufferSource(); n.buffer = nb; const f = ac.createBiquadFilter(), g = ac.createGain();
      f.type = type; f.frequency.value = freq; g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(f).connect(g); send(g, 0.1); n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.02); };
    const kick = (t, peak = 0.9, low = 45) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(low, t + 0.18);
      g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); o.connect(g); send(g, 0); o.start(t); o.stop(t + 0.45); };
    let nextBeat = 0;
    function schedBeat(b, t0) {
      const t = t0 + b * beat, bar = Math.floor(b / 4), bi = b % 4, ch = S.prog[bar % S.prog.length], R = S.root;
      const intro = bar < 2, fill = bar % 8 === 7;
      if (bi === 0) { // pad akor tiap birama
        ch.forEach(iv => note(S.pad, R + iv, t, beat * 4.2, S.pad === "sawtooth" ? 0.035 : 0.05, beat * 0.8, 0.6, S.pad === "sawtooth" ? 1400 : 0));
        if (S.pad === "sawtooth") ch.forEach(iv => note("triangle", R + iv + 12, t, beat * 4, 0.02, beat * 1.2, 0.8));
      }
      // bas
      const bassM = R - 24 + ch[0];
      if (S.bass === "drive") { note("triangle", bassM, t, beat * 0.45, 0.22); note("triangle", bassM, t + beat / 2, beat * 0.4, 0.16); }
      else if (S.bass === "half" && (bi === 0 || bi === 2)) note("sine", bassM, t, beat * 1.9, 0.22, 0.04);
      else if (S.bass === "long" && bi === 0) { note("sawtooth", bassM, t, beat * 3.9, 0.07, 0.1, 0, 400); note("sine", bassM - 12, t, beat * 3.9, 0.2, 0.1); }
      // arpeggio (petikan) dua per ketukan
      if (!(intro && S.drums === "epic")) for (let h = 0; h < 2; h++) {
        const idx = S.arp[(bi * 2 + h) % S.arp.length], m = R + 12 + ch[idx % ch.length] + (idx >= ch.length ? 12 : 0);
        note(S.drums === "epic" ? "sawtooth" : "triangle", m, t + h * beat / 2, beat * (S.drums === "soft" ? 0.9 : 0.45), S.drums === "soft" ? 0.045 : 0.035, 0.005, 0.5, S.drums === "epic" ? 1800 : 0);
      }
      // perkusi
      if (S.drums === "pop" && !intro) {
        if (bi === 0 || bi === 2) kick(t); if (bi === 2 && bar % 2) kick(t + beat / 2, 0.6);
        if (bi === 1 || bi === 3) hit(t, 0.18, 0.35, "highpass", 1800);
        hit(t + beat / 2, 0.05, 0.12, "highpass", 7000); hit(t, 0.03, 0.06, "highpass", 8000);
        if (fill && bi === 3) for (let i = 1; i < 4; i++) hit(t + i * beat / 4, 0.1, 0.25, "bandpass", 900 + i * 300);
      } else if (S.drums === "soft" && !intro) {
        hit(t, 0.06, 0.05, "highpass", 6000); hit(t + beat / 2, 0.05, 0.035, "highpass", 6000);
        if (bi === 0) kick(t, 0.35, 50);
      } else if (S.drums === "epic") {
        if (bi === 0) kick(t, 1, 38); if (bi === 2 && !intro) kick(t + beat / 2, 0.7, 40);
        if (bi === 2 && !intro) hit(t, 0.35, 0.3, "bandpass", 300);
        if (bi === 0 && bar % 4 === 0 && !intro) hit(t, 1.6, 0.12, "highpass", 4000);
        if (fill && !intro) hit(t + beat / 2, 0.2, 0.25, "bandpass", 180 + bi * 40);
      }
    }
    return { // panggil berkala; t0 = waktu AudioContext saat musik dimulai
      tick(t0) { while (t0 + nextBeat * beat < ac.currentTime + 0.6) schedBeat(nextBeat++, t0); },
    };
  }
  // Contoh musik untuk didengar sebelum dipilih (±10 detik di speaker)
  let preview = null;
  function previewMusic(style) {
    if (preview) { preview.stop(); preview = null; return false; }
    let ac; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    const g = ac.createGain(); g.gain.value = 0.6; g.connect(ac.destination);
    const gen = makeMusicGen(ac, g, style), t0 = ac.currentTime + 0.1;
    const iv = setInterval(() => gen.tick(t0), 150); gen.tick(t0);
    g.gain.setValueAtTime(0.6, t0 + 9); g.gain.linearRampToValueAtTime(0, t0 + 10.5);
    const stop = () => { clearInterval(iv); ac.close().catch(() => {}); preview = null; };
    const to = setTimeout(stop, 11000);
    preview = { stop: () => { clearTimeout(to); stop(); } };
    return true;
  }

  async function makeReport(scenes, o) {
    // mendatar 16:9 (YouTube/Facebook) atau tegak 9:16 (TikTok, Reels, Status WA)
    if (o.portrait) { W = 720; H = 1280; } else { W = 1280; H = 720; }
    if (!supported()) { o.onError("HP/browser ini belum mendukung pembuatan video."); return; }
    mk = { cancel: false };
    const cv = $("mkCanvas"); cv.width = W; cv.height = H;
    const x = cv.getContext("2d");
    const snap = document.createElement("canvas"); snap.width = W; snap.height = H; const sx = snap.getContext("2d");
    $("mk").hidden = false; document.documentElement.classList.add("vf-open");
    keepAwake(true);
    $("mkMsg").textContent = "Menyiapkan foto & video…";
    // Suara klip ikut direkam lewat Web Audio (tidak terdengar di speaker); tiap klip punya pengatur volume untuk fade
    let ac = null, dest = null;
    if (o.music || scenes.some(s => s.type === "clip" || s.type === "logo")) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); dest = ac.createMediaStreamDestination(); } catch (e) { ac = null; }
    }
    /* Foto & video disiapkan satu per satu (adegan ini + berikutnya saja), bukan semuanya di awal:
       HP tidak sanggup membuka puluhan video/foto besar sekaligus (hasilnya layar hitam atau macet). */
    const prep = s => {
      if (s.ready) return s.ready;
      if (s.type === "clip") s.ready = (async () => {
        const v = document.createElement("video");
        v.playsInline = true; v.preload = "auto"; v.src = s.url = URL.createObjectURL(s.blob);
        await new Promise(res => { v.oncanplay = res; v.onerror = res; setTimeout(res, 15000); });
        if (s.start) { try { v.currentTime = s.start; await new Promise(r => { v.onseeked = r; setTimeout(r, 3000); }); } catch (e) {} }
        if (ac) { try { const g = ac.createGain(); g.gain.value = 0; ac.createMediaElementSource(v).connect(g).connect(dest); s.gain = g; } catch (e) { v.muted = true; } } else v.muted = true;
        s.vid = v;
      })();
      else if (s.type === "logo") s.ready = prepLogo(s);
      else if (s.blob) s.ready = createImageBitmap(s.blob).then(b => { s.img = b; }, () => {});
      else s.ready = Promise.resolve();
      return s.ready;
    };
    const free = s => {
      if (s.vid) { s.vid.pause(); s.vid.removeAttribute("src"); try { s.vid.load(); } catch (e) {} URL.revokeObjectURL(s.url); s.vid = null; }
      if (s.img && s.img.close) s.img.close(); s.img = null; s.ready = null; s.logo = s.shine = null;
    };
    const FADE = 0.6;
    const total = scenes.reduce((a, s) => a + s.sec, 0);
    const mime = pickMime();
    const cs = cv.captureStream(FPS);
    if (dest) dest.stream.getAudioTracks().forEach(t => cs.addTrack(t));
    let r;
    try { r = new MediaRecorder(cs, mime ? { mimeType: mime, videoBitsPerSecond: o.portrait ? 3500000 : 4000000 } : {}); } catch (e) { r = new MediaRecorder(cs); }
    const chunks = [];
    r.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => (r.onstop = res));

    // Judul panjang dipecah per baris agar tidak terpotong (penting di format tegak)
    function wrap(t, maxW) {
      const out = []; let line = "";
      for (const w of String(t || "").split(/\s+/)) { const tryL = line ? line + " " + w : w;
        if (x.measureText(tryL).width > maxW && line) { out.push(line); line = w; } else line = tryL; }
      if (line) out.push(line); return out.slice(0, 4);
    }
    const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
    function rrect(px, py, w, h, rad) { x.beginPath(); if (x.roundRect) x.roundRect(px, py, w, h, rad); else x.rect(px, py, w, h); x.fill(); }
    // Isi berbeda rasio (foto mendatar di video tegak, video tegak di video mendatar): latar buram + gambar utuh di tengah
    function fitDraw(src, sw, sh, zoom, panX, panY) {
      const cover = Math.max(W / sw, H / sh), contain = Math.min(W / sw, H / sh);
      if (contain / cover > 0.7) {
        const sc = cover * zoom, dw = sw * sc, dh = sh * sc;
        x.drawImage(src, (W - dw) / 2 + (dw - W) / 2 * (panX || 0), (H - dh) / 2 + (dh - H) / 2 * (panY || 0), dw, dh); return;
      }
      x.save(); try { x.filter = "blur(26px) brightness(0.5) saturate(1.2)"; } catch (e) {}
      const bc = cover * 1.15; x.drawImage(src, (W - sw * bc) / 2, (H - sh * bc) / 2, sw * bc, sh * bc);
      x.restore(); x.filter = "none";
      if (!("filter" in x)) { x.fillStyle = "rgba(0,0,0,.5)"; x.fillRect(0, 0, W, H); }
      const sc = contain * zoom; x.drawImage(src, (W - sw * sc) / 2, (H - sh * sc) / 2, sw * sc, sh * sc);
    }
    /* ---------- Pembuka logo sekolah: kepingan logo berkumpul, hentakan cahaya, cincin berputar, kilau, nama sekolah ---------- */
    async function prepLogo(s) {
      try {
        const bm = await createImageBitmap(await (await fetch(s.src)).blob());
        const L = Math.round(Math.min(W, H) * (H > W ? 0.62 : 0.48));
        const sc = Math.min(L / bm.width, L / bm.height), lw = Math.round(bm.width * sc), lh = Math.round(bm.height * sc);
        // logo berlatar penuh (bukan PNG transparan): diberi cakram putih agar tampil rapi
        const t0 = document.createElement("canvas"); t0.width = bm.width; t0.height = bm.height; const tx = t0.getContext("2d"); tx.drawImage(bm, 0, 0);
        const px = (x0, y0) => tx.getImageData(x0, y0, 1, 1).data[3];
        const opaque = [px(0, 0), px(bm.width - 1, 0), px(0, bm.height - 1), px(bm.width - 1, bm.height - 1)].every(a => a > 240);
        const c = document.createElement("canvas"); c.width = L; c.height = L; const cx = c.getContext("2d");
        if (opaque) { cx.save(); cx.beginPath(); cx.arc(L / 2, L / 2, L / 2, 0, Math.PI * 2); cx.clip(); cx.fillStyle = "#fff"; cx.fillRect(0, 0, L, L);
          const s2 = Math.min(L * 0.86 / bm.width, L * 0.86 / bm.height); cx.drawImage(bm, (L - bm.width * s2) / 2, (L - bm.height * s2) / 2, bm.width * s2, bm.height * s2); cx.restore(); }
        else cx.drawImage(bm, (L - lw) / 2, (L - lh) / 2, lw, lh);
        s.logo = c; s.L = L;
        let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const N = 5; s.N = N; s.tiles = [];
        for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
          // arah lempar: menjauh dari tengah logo + sedikit acak; jarak sedang agar keping tetap terlihat di layar
          const ox = gx - (N - 1) / 2, oy = gy - (N - 1) / 2, ln = Math.hypot(ox, oy) || 1, ja = (rnd() - 0.5) * 1.2;
          const ang = Math.atan2(oy / ln, ox / ln) + ja + (ox === 0 && oy === 0 ? rnd() * 6.28 : 0), dist = L * (0.55 + rnd() * 0.55) * (0.6 + ln / N);
          const d = rnd();
          s.tiles.push({ gx, gy, dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist * (H > W ? 1.3 : 0.8), rot: (rnd() - 0.5) * Math.PI * 1.6, z: 0.7 + rnd() * 0.7, d,
            ret: 4.4 + d * 0.9, lock: 4.4 + d * 0.9 + 0.85 });
        }
        s.parts = Array.from({ length: 70 }, () => ({ a: rnd() * Math.PI * 2, r: 0.4 + rnd() * 0.8, sp: 0.6 + rnd() * 0.8, z: 1 + rnd() * 2.5 }));
        s.shine = document.createElement("canvas"); s.shine.width = L; s.shine.height = L;
      } catch (e) { s.logo = null; }
    }
    /* Alur waktu pembuka logo (detik):
       0–1.3 logo utuh muncul & menyala · 1.3–1.8 retak (garis cahaya) · 1.8–3.8 pecah melayang pelan (slow motion)
       3.8–4.4 kepingan melayang diam · 4.4–6.2 kembali menyatu satu per satu (klik) · 6.2 hentakan cahaya · 6.2–9 nama sekolah */
    const LG = { IN: 1.3, CRACK: 1.8, OUT: 3.8, BACK: 4.4, IMP: 6.2 };
    const easeIO = t => { t = Math.min(1, Math.max(0, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    const backOut = t => { t = Math.min(1, Math.max(0, t)); const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    function logoSfx(s) { // efek suara sintetis mengikuti alur animasi
      if (!ac || !dest) return;
      const now = ac.currentTime, out = ac.createGain(); out.gain.value = 0.7; out.connect(dest);
      const noise = dur => { const b = ac.createBuffer(1, Math.round(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const n = ac.createBufferSource(); n.buffer = b; return n; };
      const tone = (type, f0, f1, t, dur, peak, att = 0.02) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
        o.frequency.setValueAtTime(f0, now + t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, now + t + dur);
        g.gain.setValueAtTime(0.0001, now + t); g.gain.exponentialRampToValueAtTime(peak, now + t + att); g.gain.exponentialRampToValueAtTime(0.0001, now + t + dur);
        o.connect(g).connect(out); o.start(now + t); o.stop(now + t + dur + 0.05); };
      const sweep = (t, dur, f0, f1, peak, q = 1.2) => { const n = noise(dur + 0.1), f = ac.createBiquadFilter(), g = ac.createGain(); f.type = "bandpass"; f.Q.value = q;
        f.frequency.setValueAtTime(f0, now + t); f.frequency.exponentialRampToValueAtTime(f1, now + t + dur);
        g.gain.setValueAtTime(0.0001, now + t); g.gain.exponentialRampToValueAtTime(peak, now + t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, now + t + dur);
        n.connect(f).connect(g).connect(out); n.start(now + t); n.stop(now + t + dur + 0.1); };
      // dengung muncul
      tone("sine", 55, 55, 0, 1.8, 0.35, 0.8); tone("triangle", 110, 110, 0.2, 1.6, 0.08, 0.6);
      // retakan
      for (let i = 0; i < 7; i++) { const t = LG.IN + i * 0.07 + Math.random() * 0.03; const n = noise(0.05), f = ac.createBiquadFilter(), g = ac.createGain();
        f.type = "highpass"; f.frequency.value = 2500; g.gain.setValueAtTime(0.35, now + t); g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.05);
        n.connect(f).connect(g).connect(out); n.start(now + t); n.stop(now + t + 0.06); }
      // pecah: hentakan kecil + desir turun pelan (slow motion) + dengung turun
      tone("sine", 160, 60, LG.CRACK, 0.6, 0.6); sweep(LG.CRACK, 1.9, 4000, 300, 0.45);
      tone("sawtooth", 98, 49, LG.CRACK, 2.6, 0.05, 0.4);
      // kembali: desir naik
      sweep(LG.BACK - 0.2, LG.IMP - LG.BACK + 0.2, 250, 5000, 0.5);
      // klik mekanis tiap keping terkunci
      (s.tiles || []).forEach(k => { const t = k.lock; tone("square", 700 + Math.random() * 1500, 700, t, 0.04, 0.09, 0.002); });
      // hentakan utama
      tone("sine", 150, 36, LG.IMP, 1.1, 1, 0.005);
      { const n = noise(0.6), f = ac.createBiquadFilter(), g = ac.createGain(); f.type = "lowpass"; f.frequency.value = 1600;
        g.gain.setValueAtTime(0.6, now + LG.IMP); g.gain.exponentialRampToValueAtTime(0.0001, now + LG.IMP + 0.55); n.connect(f).connect(g).connect(out); n.start(now + LG.IMP); n.stop(now + LG.IMP + 0.6); }
      // kilau + nada latar
      [1318.5, 1760, 2637, 3520].forEach((fr, i) => tone("sine", fr, fr, LG.IMP + 0.6 + i * 0.07, 1.6, 0.06));
      [220, 277.2, 329.6, 440].forEach(fr => { const o = ac.createOscillator(), g = ac.createGain(), t = now + LG.IMP; o.type = "triangle"; o.frequency.value = fr;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.8); g.gain.setValueAtTime(0.05, t + 2); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.9);
        o.connect(g).connect(out); o.start(t); o.stop(t + 3); });
    }
    function paintLogo(s, t) {
      const L = s.L, cx = W / 2, cy = H * 0.42, M = Math.max(W, H);
      const bg = x.createRadialGradient(cx, cy, 0, cx, cy, M * 0.75);
      bg.addColorStop(0, "#2a2f2c"); bg.addColorStop(0.6, "#121614"); bg.addColorStop(1, "#050606");
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      if (!s.logo) return;
      const k = t - LG.IMP;
      // sinar berputar di belakang logo (setelah menyatu)
      if (k > 0) { const a = Math.min(1, k / 0.6) * 0.16;
        x.save(); x.translate(cx, cy); x.rotate(k * 0.22);
        for (let i = 0; i < 14; i++) { x.rotate(Math.PI * 2 / 14); x.fillStyle = `rgba(242,183,5,${a})`;
          x.beginPath(); x.moveTo(0, 0); x.lineTo(-L * 0.12, -M); x.lineTo(L * 0.12, -M); x.closePath(); x.fill(); }
        x.restore(); }
      // partikel
      for (const p of s.parts) {
        let rr, al;
        if (t < LG.CRACK) { rr = L * (0.55 + p.r * 0.3) + Math.sin(t * p.sp * 2 + p.a) * 6; al = 0.25 * Math.min(1, t / LG.IN); }
        else if (t < LG.BACK) { const q = (t - LG.CRACK) / (LG.BACK - LG.CRACK); rr = L * 0.5 + ease(q) * M * 0.45 * p.r; al = 0.8 * (1 - q * 0.6); }
        else if (k < 0) { const q = easeIO((t - LG.BACK) / (LG.IMP - LG.BACK)); rr = (L * 0.5 + M * 0.45 * p.r) * (1 - q) + L * 0.45 * q; al = 0.5 + 0.5 * q; }
        else { const q = k * p.sp; rr = L * 0.45 + q * M * 0.6; al = Math.max(0, 1 - q * 1.3); }
        if (al <= 0) continue;
        x.fillStyle = `rgba(255,214,90,${al})`; x.beginPath(); x.arc(cx + Math.cos(p.a + t * 0.25) * rr, cy + Math.sin(p.a + t * 0.25) * rr, p.z, 0, Math.PI * 2); x.fill();
      }
      const ts = L / s.N;
      if (t < LG.CRACK) { // logo utuh muncul, menyala, lalu retak
        const a = easeIO(t / LG.IN), sc = 0.85 + 0.15 * ease(t / LG.IN), d = L * sc;
        x.save(); x.globalAlpha = a; x.shadowColor = "rgba(242,183,5,.7)"; x.shadowBlur = 20 + 25 * Math.sin(Math.min(1, t / LG.IN) * Math.PI);
        if (t < LG.IN) x.drawImage(s.logo, cx - d / 2, cy - d / 2, d, d);
        else { // retak: keping bergetar halus + garis cahaya di sambungan
          const q = (t - LG.IN) / (LG.CRACK - LG.IN);
          for (const tl of s.tiles) { const jx = (Math.random() - 0.5) * 3 * q, jy = (Math.random() - 0.5) * 3 * q;
            x.drawImage(s.logo, tl.gx * ts, tl.gy * ts, ts, ts, cx - L / 2 + tl.gx * ts + jx, cy - L / 2 + tl.gy * ts + jy, ts, ts); }
          x.shadowBlur = 12; x.strokeStyle = `rgba(255,220,120,${q})`; x.lineWidth = 2;
          for (let i = 1; i < s.N; i++) { x.beginPath(); x.moveTo(cx - L / 2 + i * ts, cy - L / 2); x.lineTo(cx - L / 2 + i * ts, cy - L / 2 + L * Math.min(1, q * 1.6)); x.stroke();
            x.beginPath(); x.moveTo(cx - L / 2, cy - L / 2 + i * ts); x.lineTo(cx - L / 2 + L * Math.min(1, q * 1.6), cy - L / 2 + i * ts); x.stroke(); }
        }
        x.restore();
      } else if (k < 0) { // pecah melayang pelan, diam sejenak, lalu kembali satu per satu
        for (const tl of s.tiles) {
          let q; // 0 = di tempatnya, 1 = terlempar penuh
          if (t < tl.ret) q = ease((t - LG.CRACK - tl.d * 0.25) / (LG.OUT - LG.CRACK));
          else q = 1 - backOut((t - tl.ret) / (tl.lock - tl.ret));
          q = Math.max(0, q);
          const drift = t < tl.ret ? Math.sin((t - LG.CRACK) * 1.3 + tl.d * 9) * 8 * q : 0;
          const fx = cx - L / 2 + tl.gx * ts + ts / 2, fy = cy - L / 2 + tl.gy * ts + ts / 2;
          const zs = 1 + (tl.z - 1) * q;
          x.save(); x.translate(fx + tl.dx * q + drift, fy + tl.dy * q - drift * 0.6); x.rotate(tl.rot * q); x.scale(zs, zs);
          x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 18 * q;
          x.drawImage(s.logo, tl.gx * ts, tl.gy * ts, ts, ts, -ts / 2 - 0.5, -ts / 2 - 0.5, ts + 1, ts + 1);
          x.shadowBlur = 0;
          if (q > 0.02) { x.strokeStyle = `rgba(255,214,90,${Math.min(1, q * 1.5) * 0.9})`; x.lineWidth = 2 / zs; x.strokeRect(-ts / 2, -ts / 2, ts, ts); }
          x.restore();
          // kilatan kecil saat keping terkunci
          const lk = t - tl.lock; if (lk > 0 && lk < 0.25) { x.fillStyle = `rgba(255,240,180,${0.8 * (1 - lk / 0.25)})`; x.fillRect(fx - ts / 2, fy - ts / 2, ts, ts); }
        }
      } else { // menyatu: hentakan, cincin, kilau, nama sekolah
        const bounce = 1 + 0.08 * Math.exp(-k * 4) * Math.cos(k * 14), d = L * bounce;
        x.save(); x.translate(cx, cy); x.lineCap = "round";
        const ra = Math.min(1, k / 0.5);
        [[0.62, 0.8, 5, 7], [0.7, -0.5, 3, 11]].forEach(([rf, sp, lw, seg]) => {
          x.strokeStyle = `rgba(242,183,5,${0.85 * ra})`; x.lineWidth = lw;
          for (let i = 0; i < seg; i++) { const a0 = i * Math.PI * 2 / seg + k * sp; x.beginPath(); x.arc(0, 0, L * rf * (0.9 + 0.1 * ra), a0, a0 + Math.PI * 2 / seg * 0.62); x.stroke(); }
        });
        x.restore();
        x.save(); x.shadowColor = "rgba(242,183,5,.8)"; x.shadowBlur = 30 + 30 * Math.exp(-k * 2);
        x.drawImage(s.logo, cx - d / 2, cy - d / 2, d, d); x.restore();
        if (k > 0.6 && k < 1.6) {
          const sh = s.shine, sx2 = sh.getContext("2d"), p = (k - 0.6) / 1.0;
          sx2.clearRect(0, 0, L, L); sx2.globalCompositeOperation = "source-over"; sx2.drawImage(s.logo, 0, 0);
          sx2.globalCompositeOperation = "source-atop";
          const gx = -L + p * L * 3, g = sx2.createLinearGradient(gx, 0, gx + L * 0.5, L * 0.5);
          g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,.75)"); g.addColorStop(1, "rgba(255,255,255,0)");
          sx2.fillStyle = g; sx2.fillRect(0, 0, L, L); sx2.globalCompositeOperation = "source-over";
          x.drawImage(sh, cx - d / 2, cy - d / 2, d, d);
        }
        const sw = k / 0.8; if (sw < 1) { x.strokeStyle = `rgba(255,230,150,${1 - sw})`; x.lineWidth = 8 * (1 - sw) + 1;
          x.beginPath(); x.arc(cx, cy, L * 0.5 + sw * M * 0.6, 0, Math.PI * 2); x.stroke(); }
        if (k < 0.35) { x.fillStyle = `rgba(255,248,225,${0.75 * (1 - k / 0.35)})`; x.fillRect(0, 0, W, H); }
        const a1 = ease((k - 0.7) / 0.8), a2 = ease((k - 1.1) / 0.8), P = H > W;
        x.textAlign = "center"; x.globalAlpha = a1; x.fillStyle = "#fff"; x.font = `800 ${P ? 48 : 52}px Arial, sans-serif`;
        const ty = cy + L * 0.5 + (P ? 120 : 92) + (1 - a1) * 30;
        const lines = wrap(s.title, W - 80); lines.forEach((l, i) => x.fillText(l, cx, ty + i * (P ? 58 : 60)));
        x.globalAlpha = a2; x.fillStyle = "#f2b705"; x.font = `700 ${P ? 24 : 26}px Arial, sans-serif`;
        x.fillText(s.sub || "", cx, ty + lines.length * (P ? 58 : 60) + 6);
        x.globalAlpha = 1; x.textAlign = "left";
      }
    }
    function paintScene(s, t, i) {
      if (s.type === "logo") return paintLogo(s, t);
      const P = H > W, m = P ? 56 : 110;
      if (s.type === "title") {
        const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#26302c"); g.addColorStop(1, "#0d1110");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        const rg = x.createRadialGradient(W * 0.85, H * 0.15, 0, W * 0.85, H * 0.15, Math.max(W, H) * 0.6);
        rg.addColorStop(0, "rgba(242,183,5,.18)"); rg.addColorStop(1, "rgba(242,183,5,0)"); x.fillStyle = rg; x.fillRect(0, 0, W, H);
        x.textAlign = "left";
        x.font = `700 ${P ? 24 : 26}px Arial, sans-serif`; const kick = wrap(s.kicker, W - m - 40);
        x.font = `800 ${P ? 58 : 64}px Arial, sans-serif`; const tl = wrap(s.title, W - m - 40);
        x.font = `500 ${P ? 26 : 28}px Arial, sans-serif`; const ls = (s.lines || []).flatMap(l => wrap(l, W - m - 40));
        const hgt = kick.length * 38 + tl.length * (P ? 68 : 74) + 16 + ls.length * 40;
        let y = Math.round((H - hgt) / 2) + 30;
        const a1 = ease(t / 0.7), a2 = ease((t - 0.2) / 0.7), a3 = ease((t - 0.4) / 0.7);
        x.fillStyle = "#f2b705"; x.fillRect(m - 36, y - 32, 8, (hgt + 10) * a1);
        x.globalAlpha = a1; x.font = `700 ${P ? 24 : 26}px Arial, sans-serif`; x.fillStyle = "#f2b705";
        kick.forEach(l => { x.fillText(l.toUpperCase(), m + (1 - a1) * 30, y); y += 38; });
        y += P ? 36 : 42; x.globalAlpha = a2; x.fillStyle = "#fff"; x.font = `800 ${P ? 58 : 64}px Arial, sans-serif`;
        tl.forEach(l => { x.fillText(l, m + (1 - a2) * 40, y, W - m - 40); y += P ? 68 : 74; });
        y += 6; x.globalAlpha = a3; x.font = `500 ${P ? 26 : 28}px Arial, sans-serif`; x.fillStyle = "#c9d0cc";
        ls.forEach(l => { x.fillText(l, m + (1 - a3) * 40, y, W - m - 40); y += 40; });
        x.globalAlpha = 1;
        return;
      }
      x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
      if (s.type === "clip") { const v = s.vid; if (v && v.videoWidth) fitDraw(v, v.videoWidth, v.videoHeight, 1); }
      else if (s.img) { // gerak perlahan bergantian: masuk/keluar & geser kiri/kanan
        const p = t / s.sec, dir = i % 4;
        const zoom = dir % 2 ? 1.08 - 0.06 * p : 1.02 + 0.06 * p, pan = (dir < 2 ? -1 : 1) * (p - 0.5) * 0.6;
        fitDraw(s.img, s.img.width, s.img.height, zoom, pan, 0);
      }
      // gradasi bawah agar keterangan terbaca
      const gb = x.createLinearGradient(0, H * 0.62, 0, H); gb.addColorStop(0, "rgba(0,0,0,0)"); gb.addColorStop(1, "rgba(0,0,0,.65)");
      x.fillStyle = gb; x.fillRect(0, H * 0.62, W, H * 0.38);
      let a = ease((t - 0.25) / 0.6);
      if (s.type === "clip" && s.sec > 6) a *= 1 - ease((t - 4) / 0.6); // video panjang: keterangan hilang setelah 4 detik
      if (s.badge) {
        x.globalAlpha = a; x.font = `800 ${P ? 22 : 24}px Arial, sans-serif`; const bw = x.measureText(s.badge).width + 34;
        x.fillStyle = s.badgeColor || "#f2b705"; rrect(36, 36, bw, 46, 23);
        x.fillStyle = "#1d2421"; x.textAlign = "left"; x.fillText(s.badge, 53, 67); x.globalAlpha = 1;
      }
      if (s.label) { // keterangan bawah (lower third): garis kuning + teks putih
        const parts = String(s.label).split(" · "), date = /^\d{4}-\d{2}-\d{2}$/.test(parts[parts.length - 1]) ? parts.pop() : "";
        x.font = `700 ${P ? 30 : 30}px Arial, sans-serif`; const ls = wrap(parts.join(" · "), W - 120);
        const lh = 38, boxH = ls.length * lh + (date ? 32 : 0);
        let y = H - (P ? 150 : 60) - boxH;
        x.globalAlpha = a; x.fillStyle = "#f2b705"; x.fillRect(40, y - 6, 6, boxH + 8);
        x.fillStyle = "#fff"; x.textAlign = "left"; x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 8;
        ls.forEach(l => { y += lh - 8; x.fillText(l, 62 + (1 - a) * 24, y); y += 8; });
        if (date) { x.font = `500 ${P ? 22 : 22}px Arial, sans-serif`; x.fillStyle = "#e8d48a"; x.fillText(date, 62 + (1 - a) * 24, y + 26); }
        x.shadowBlur = 0; x.globalAlpha = 1;
      }
    }

    if (ac && ac.state === "suspended") { try { await ac.resume(); } catch (e) {} }
    /* Musik latar: bawaan (dibuat aplikasi) atau lagu pilihan dari HP. Mulai setelah pembuka logo,
       mengecil saat video berisi suara asli diputar, memudar di akhir. */
    let mus = null;
    if (o.music && ac && dest) {
      const bus = ac.createGain(); bus.gain.value = 0.0001;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
      bus.connect(comp).connect(dest);
      mus = { bus, t0: null, level: -1 };
      if (o.music.kind === "file") {
        const el = new Audio(); el.loop = true; el.preload = "auto"; el.src = mus.url = URL.createObjectURL(o.music.blob);
        await new Promise(res => { el.oncanplay = res; el.onerror = res; setTimeout(res, 8000); });
        try { ac.createMediaElementSource(el).connect(bus); mus.el = el; } catch (e) { mus = null; }
      } else mus.gen = makeMusicGen(ac, bus, o.music.style);
    }
    const musLevel = (want) => { if (!mus || Math.abs(want - mus.level) < 0.02) return; mus.level = want; mus.bus.gain.setTargetAtTime(Math.max(0.0001, want), ac.currentTime, 0.25); };
    prep(scenes[0]); if (scenes[1]) prep(scenes[1]);
    let elapsed = 0, started = false;
    for (let i = 0; i < scenes.length && !mk.cancel; i++) {
      const s = scenes[i];
      // tunggu adegan ini siap; perekaman dijeda selama menunggu agar tidak ada jeda kosong di hasil
      if (started && r.state === "recording") { r.pause(); if (mus) { if (mus.el) mus.el.pause(); try { await ac.suspend(); } catch (e) {} } }
      $("mkMsg").textContent = `Menyiapkan adegan ${i + 1}/${scenes.length}…`;
      await prep(s);
      if (scenes[i + 1]) prep(scenes[i + 1]);
      if (ac && ac.state === "suspended") { try { await ac.resume(); } catch (e) {} }
      if (!started) { r.start(1000); started = true; } else if (r.state === "paused") r.resume();
      if (mus && s.type !== "logo") {
        if (mus.t0 === null) { mus.t0 = ac.currentTime + 0.05; if (mus.el) { mus.el.currentTime = 0; } }
        if (mus.el) mus.el.play().catch(() => {});
      }
      if (s.vid) { s.vid.play().catch(() => { s.vid.muted = true; s.vid.play().catch(() => {}); }); }
      if (s.type === "logo") logoSfx(s);
      const t0 = performance.now();
      await new Promise(resolve => {
        const tick = () => {
          if (mk.cancel) return resolve();
          const local = (performance.now() - t0) / 1000;
          if (local >= s.sec) return resolve();
          paintScene(s, local, i);
          if (i > 0 && local < FADE) { x.globalAlpha = 1 - ease(local / FADE); x.drawImage(snap, 0, 0); x.globalAlpha = 1; }
          if (i === scenes.length - 1 && local > s.sec - 0.8) { x.fillStyle = `rgba(0,0,0,${(local - (s.sec - 0.8)) / 0.8})`; x.fillRect(0, 0, W, H); }
          if (s.gain) s.gain.gain.value = Math.min(1, local / 0.4, (s.sec - local) / 0.5); // suara masuk & keluar halus
          const now = elapsed + local;
          if (mus && mus.t0 !== null) {
            if (mus.gen) mus.gen.tick(mus.t0);
            const base = (o.music.vol || 0.8) * (s.type === "clip" ? 0.3 : 1), left = total - now;
            musLevel(base * Math.min(1, left / 2.5));
          }
          $("mkBar").style.width = (now / total * 100).toFixed(1) + "%";
          $("mkMsg").textContent = `Membuat video… ${mmss(now)} / ${mmss(total)} (biarkan layar tetap menyala)`;
          requestAnimationFrame(tick);
        };
        tick();
      });
      sx.drawImage(cv, 0, 0); // bingkai terakhir untuk transisi ke adegan berikutnya
      elapsed += s.sec;
      free(s);
    }
    if (r.state !== "inactive") { r.stop(); await done; }
    scenes.forEach(free);
    if (mus && mus.el) { mus.el.pause(); URL.revokeObjectURL(mus.url); }
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

  window.KKAVid = { _level: () => rec && rec.level, supported, openRecorder, makeReport, pickMime, previewMusic };
})();

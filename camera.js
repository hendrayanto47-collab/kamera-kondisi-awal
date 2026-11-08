/* Kamera langsung dengan arahan real-time.
   Membaca sensor gerak HP (kemiringan, goyangan) dan gambar kamera (cahaya),
   lalu memberi arahan sampai muncul "Posisi pas — jepret sekarang!".
   Aplikasi terkunci tegak (portrait); saat HP dimiringkan, foto diputar otomatis
   menurut sensor sehingga hasilnya landscape — seperti aplikasi kamera bawaan.
   Menyediakan window.KKACam. */
(function () {
  const $ = id => document.getElementById(id);
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // Batas arahan (bisa disetel)
  const T = {
    level: 2.5,      // derajat miring maksimal terhadap garis datar
    pitchBld: 20,    // derajat mendongak/menunduk maksimal untuk foto bangunan
    pitchRoom: 35,   // untuk foto dalam ruangan
    shake: 30,       // kecepatan putar (°/detik) maksimal agar dianggap stabil
    dark: 50, bright: 215,
  };

  let stream = null, timer = null, opts = null;
  let grav = null, rot = 0, motionSeen = false, wasReady = false, lastBright = null;
  let ghostOn = false;

  function onMotion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    const s = isIOS ? -1 : 1; // iOS melaporkan arah gravitasi terbalik dari Android
    const n = { x: s * g.x, y: s * g.y, z: s * g.z };
    grav = grav ? { x: grav.x * 0.75 + n.x * 0.25, y: grav.y * 0.75 + n.y * 0.25, z: grav.z * 0.75 + n.z * 0.25 } : n;
    const r = e.rotationRate;
    if (r && (r.alpha != null || r.beta != null)) rot = rot * 0.7 + Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0) * 0.3;
    motionSeen = true;
  }
  function screenAngle() {
    let a = (screen.orientation && typeof screen.orientation.angle === "number") ? screen.orientation.angle : (window.orientation || 0);
    a = ((a % 360) + 360) % 360;
    return a > 180 ? a - 360 : a;
  }
  /* roll: 0 = HP tegak, +90 = diputar berlawanan jarum jam (atas ke kiri), -90 = searah jarum jam.
     pitch: + = layar menghadap ke atas (kamera menunduk), - = kamera mendongak. */
  function pose() {
    if (!grav || Math.hypot(grav.x, grav.y, grav.z) < 3) return null;
    const roll = Math.atan2(grav.x, grav.y) * 180 / Math.PI;
    const pitch = Math.atan2(grav.z, Math.hypot(grav.x, grav.y)) * 180 / Math.PI;
    let snapped = Math.round(roll / 90) * 90; if (snapped === -180) snapped = 180;
    return { roll, pitch, snapped, level: roll - snapped };
  }
  // Putaran (derajat, kelipatan 90) yang dibutuhkan agar gambar tegak terhadap dunia nyata
  function frameRotation(p) {
    if (!p) return 0;
    let r = -(p.snapped - screenAngle());
    r = ((r % 360) + 360) % 360;
    return r;
  }

  async function requestSensors() {
    try {
      if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        await DeviceMotionEvent.requestPermission(); // iOS: harus dari ketukan pengguna
      }
    } catch (e) {}
    window.addEventListener("devicemotion", onMotion);
  }

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
  }

  async function open(o) {
    opts = o;
    grav = null; rot = 0; motionSeen = false; wasReady = false; lastBright = null;
    const sensorP = requestSensors(); // dipanggil langsung dari ketukan (iOS)
    // Foto acuan 0% (untuk tahap 25–100%): tampil samar di atas gambar kamera
    ghostOn = !!o.ghost;
    $("vfGhost").hidden = !ghostOn; $("vfGhostBtn").hidden = !o.ghost;
    if (o.ghost) { $("vfGhost").src = o.ghost; $("vfGhostBtn").innerHTML = "Acuan 0%<br>sembunyikan"; }
    $("vfTitle").textContent = o.title;
    $("vfSub").textContent = o.sub || "";
    $("vf").hidden = false;
    document.documentElement.classList.add("vf-open");
    setHint("wait", "Membuka kamera…");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } },
      });
    } catch (e) {
      close();
      o.onFallback(e && e.name === "NotAllowedError"
        ? "Izin kamera ditolak. Memakai kamera bawaan HP."
        : "Kamera langsung tidak tersedia. Memakai kamera bawaan HP.");
      return;
    }
    await sensorP;
    const v = $("vfVideo");
    v.srcObject = stream;
    try { await v.play(); } catch (e) {}
    await new Promise(r => (v.videoWidth ? r() : v.addEventListener("loadedmetadata", r, { once: true })));
    layout();
    timer = setInterval(tick, 250);
  }

  function close() {
    clearInterval(timer); timer = null;
    window.removeEventListener("devicemotion", onMotion);
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    $("vfVideo").srcObject = null;
    if (opts && opts.ghost) { try { URL.revokeObjectURL(opts.ghost); } catch (e) {} }
    $("vfGhost").hidden = true; $("vfGhost").removeAttribute("src");
    $("vf").hidden = true;
    document.documentElement.classList.remove("vf-open");
  }

  // Letakkan lapisan garis bantu tepat di atas area gambar (video object-fit: contain)
  function layout() {
    const v = $("vfVideo"), box = v.getBoundingClientRect();
    const vw = v.videoWidth || 4, vh = v.videoHeight || 3;
    const s = Math.min(box.width / vw, box.height / vh);
    const w = vw * s, h = vh * s;
    const g = $("vfGuide");
    g.style.left = box.left + (box.width - w) / 2 + "px";
    g.style.top = box.top + (box.height - h) / 2 + "px";
    g.style.width = w + "px"; g.style.height = h + "px";
    g.setAttribute("viewBox", `0 0 ${Math.round(w)} ${Math.round(h)}`);
  }
  window.addEventListener("resize", () => { if (stream) layout(); });

  // Garis bantu: garis sepertiga + garis tengah "pojok bangunan" untuk sudut serong
  // Letakkan foto acuan tepat di atas area gambar, diputar sesuai posisi HP
  function placeGhost(turn) {
    if (!ghostOn) return;
    const g = $("vfGuide"), w = parseFloat(g.style.width) || 0, h = parseFloat(g.style.height) || 0;
    const l = parseFloat(g.style.left) || 0, t = parseFloat(g.style.top) || 0;
    const im = $("vfGhost"), sw = turn % 180 !== 0;
    im.style.width = (sw ? h : w) + "px"; im.style.height = (sw ? w : h) + "px";
    im.style.left = l + w / 2 + "px"; im.style.top = t + h / 2 + "px";
    im.style.transform = `translate(-50%,-50%) rotate(${(360 - turn) % 360}deg)`;
  }
  $("vfGhostBtn").addEventListener("click", () => {
    ghostOn = !ghostOn; $("vfGhost").hidden = !ghostOn;
    $("vfGhostBtn").innerHTML = ghostOn ? "Acuan 0%<br>sembunyikan" : "Acuan 0%<br>tampilkan";
  });

  function drawGuide(turn) {
    const g = $("vfGuide"), w = parseFloat(g.style.width) || 0, h = parseFloat(g.style.height) || 0;
    if (!w) return;
    let out = "";
    for (const f of [1 / 3, 2 / 3]) {
      out += `<line class="vg-third" x1="${w * f}" y1="0" x2="${w * f}" y2="${h}"/><line class="vg-third" x1="0" y1="${h * f}" x2="${w}" y2="${h * f}"/>`;
    }
    if (opts && opts.corner) {
      // "Tegak di dunia nyata": bila gambar perlu diputar 90/270, garis itu tampil mendatar di layar
      out += turn % 180 === 0
        ? `<line class="vg-corner" x1="${w / 2}" y1="${h * 0.06}" x2="${w / 2}" y2="${h * 0.94}"/>`
        : `<line class="vg-corner" x1="${w * 0.06}" y1="${h / 2}" x2="${w * 0.94}" y2="${h / 2}"/>`;
    }
    g.innerHTML = out;
  }

  function measureBrightness() {
    const v = $("vfVideo"); if (!v.videoWidth) return null;
    const c = measureBrightness.c || (measureBrightness.c = document.createElement("canvas"));
    c.width = 64; c.height = 48;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(v, 0, 0, 64, 48);
    const d = x.getImageData(0, 0, 64, 48).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (64 * 48);
  }

  function setHint(state, msg) {
    $("vfMsg").textContent = msg;
    $("vf").dataset.state = state;
  }

  function tick() {
    if (!stream) return;
    const v = $("vfVideo");
    const p = pose();
    const turn = frameRotation(p);
    const b = measureBrightness(); if (b != null) lastBright = b;

    // Putar kotak arahan agar terbaca saat HP dimiringkan
    const cssTurn = (360 - turn) % 360;
    $("vfHint").dataset.turn = String(cssTurn);
    $("vfLevel").style.transform = p ? `translate(-50%,-50%) rotate(${-p.roll}deg)` : "translate(-50%,-50%)";
    $("vfLevelRef").style.transform = p ? `translate(-50%,-50%) rotate(${-p.snapped}deg)` : "translate(-50%,-50%)";
    drawGuide(turn); placeGhost(turn);

    // Syarat
    const frameLandscape = turn % 180 === 0 ? v.videoWidth > v.videoHeight : v.videoHeight > v.videoWidth;
    const landscape = p ? frameLandscape : v.videoWidth > v.videoHeight;
    const pitchMax = opts.room ? T.pitchRoom : T.pitchBld;
    const checks = [
      { k: "land", label: "Landscape", ok: landscape },
      { k: "level", label: "Lurus", ok: p ? Math.abs(p.level) <= T.level : null },
      { k: "pitch", label: "Tegak", ok: p ? Math.abs(p.pitch) <= pitchMax : null },
      { k: "steady", label: "Stabil", ok: motionSeen ? rot <= T.shake : null },
      { k: "light", label: "Cahaya", ok: lastBright == null ? null : lastBright >= T.dark && lastBright <= T.bright },
    ];
    const gps = opts.gps ? opts.gps() : null;
    if (gps) checks.push({ k: "gps", label: gps.label, ok: gps.ok, soft: true });
    $("vfChips").innerHTML = checks.map(c =>
      `<span class="vc ${c.ok === true ? "ok" : c.ok === false ? (c.soft ? "soft" : "no") : "na"}">${c.label}</span>`).join("");

    // Arahan: syarat pertama yang belum terpenuhi
    let msg = "", state = "go";
    if (!landscape) { state = "no"; msg = "Miringkan HP ke posisi mendatar (landscape)."; }
    else if (p && Math.abs(p.level) > T.level) {
      state = "no";
      const deg = Math.round(Math.abs(p.level));
      msg = `HP miring ${deg}°. Putar pelan ${p.level > 0 ? "searah jarum jam ↻" : "berlawanan jarum jam ↺"} sampai garis hijau.`;
    }
    else if (p && Math.abs(p.pitch) > pitchMax) {
      state = "no";
      msg = p.pitch > 0 ? "HP terlalu menunduk. Tegakkan HP, arahkan lurus ke bangunan." : "HP terlalu mendongak. Mundur beberapa langkah lalu tegakkan HP.";
    }
    else if (lastBright != null && lastBright < T.dark) { state = "no"; msg = "Terlalu gelap. Nyalakan lampu atau buka jendela, atau foto saat siang."; }
    else if (lastBright != null && lastBright > T.bright) { state = "no"; msg = "Terlalu silau. Jangan menghadap matahari atau jendela terang."; }
    else if (motionSeen && rot > T.shake) { state = "wait"; msg = "Tahan HP diam sebentar…"; }
    else { state = "go"; msg = "Posisi pas — jepret sekarang!"; }
    if (state === "go" && !p) msg = "Siap jepret. (Sensor kemiringan tidak terbaca — pastikan HP lurus.)";
    setHint(state, msg);

    if (state === "go" && !wasReady && navigator.vibrate) { try { navigator.vibrate(40); } catch (e) {} }
    wasReady = state === "go";
  }

  // Ambil satu bingkai dari video, diputar sesuai posisi HP
  async function capture() {
    const v = $("vfVideo"); if (!v.videoWidth) return;
    const turn = frameRotation(pose());
    const vw = v.videoWidth, vh = v.videoHeight;
    const c = document.createElement("canvas");
    const swap = turn % 180 !== 0;
    c.width = swap ? vh : vw; c.height = swap ? vw : vh;
    const x = c.getContext("2d");
    x.translate(c.width / 2, c.height / 2);
    x.rotate(turn * Math.PI / 180);
    x.drawImage(v, -vw / 2, -vh / 2, vw, vh);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
    $("vf").classList.add("flash"); setTimeout(() => $("vf").classList.remove("flash"), 180);
    const file = new File([blob], "kamera.jpg", { type: "image/jpeg", lastModified: Date.now() });
    const o = opts; close(); o.onShot(file);
  }

  $("vfShutter").addEventListener("click", capture);
  $("vfClose").addEventListener("click", () => { const o = opts; close(); if (o && o.onClose) o.onClose(); });
  $("vfNative").addEventListener("click", () => { const o = opts; close(); o.onFallback(""); });

  window.KKACam = { supported, open, close, T, _pose: pose, _frameRotation: frameRotation };
  // Sensor dipakai bersama oleh perekam video
  window.KKASensor = {
    start() { grav = null; rot = 0; motionSeen = false; return requestSensors(); },
    stop() { window.removeEventListener("devicemotion", onMotion); },
    pose, frameRotation, shake: () => rot, seen: () => motionSeen, T,
  };
})();

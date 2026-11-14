/* Perbaikan file video hasil MediaRecorder agar durasinya terbaca dan bisa digeser di galeri/WhatsApp/Drive.
   - MP4 dari perekam browser berbentuk "fragmented MP4" (moov tanpa tabel sampel + moof/mdat berulang, durasi 0).
     Di sini disusun ulang menjadi MP4 biasa: ftyp + moov (lengkap dengan stts/stsz/stco/stss + durasi) + satu mdat.
   - WebM dari perekam browser tidak punya elemen Duration; di sini disisipkan.
   Bila format tidak dikenali atau sudah normal, file dikembalikan apa adanya.
   Menyediakan window.KKAFix.fix(blob, durSec) -> Promise<Blob>. */
(function () {
  const u32 = (d, o) => d.getUint32(o);
  const u64 = (d, o) => d.getUint32(o) * 4294967296 + d.getUint32(o + 4);
  const typ = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);

  function boxes(u8, dv, start, end) {
    const out = [];
    let o = start;
    while (o + 8 <= end) {
      let size = u32(dv, o), hdr = 8;
      const t = typ(u8, o + 4);
      if (size === 1) { size = u64(dv, o + 8); hdr = 16; } else if (size === 0) size = end - o;
      if (size < hdr || o + size > end) break;
      out.push({ t, o, size, hdr, s: o + hdr, e: o + size });
      o += size;
    }
    return out;
  }
  const find = (list, t) => list.find(b => b.t === t);

  // ---- penulis kotak MP4
  function box(t, ...parts) {
    let len = 8; for (const p of parts) len += p.length;
    const out = new Uint8Array(len), dv = new DataView(out.buffer);
    dv.setUint32(0, len); for (let i = 0; i < 4; i++) out[4 + i] = t.charCodeAt(i);
    let o = 8; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  function fullBox(t, ver, flags, body) {
    const h = new Uint8Array(4); h[0] = ver; h[1] = (flags >> 16) & 255; h[2] = (flags >> 8) & 255; h[3] = flags & 255;
    return box(t, h, body);
  }
  function u32arr(arr) { const b = new Uint8Array(arr.length * 4), dv = new DataView(b.buffer); arr.forEach((v, i) => dv.setUint32(i * 4, v >>> 0)); return b; }
  function i32arr(arr) { const b = new Uint8Array(arr.length * 4), dv = new DataView(b.buffer); arr.forEach((v, i) => dv.setInt32(i * 4, v | 0)); return b; }

  // Salin kotak header (mvhd/tkhd/mdhd) sambil menulis durasi baru
  function withDuration(u8, b, kind, dur) {
    const c = u8.slice(b.o, b.e), dv = new DataView(c.buffer), ver = c[b.hdr];
    const base = b.hdr + 4;
    if (kind === "tkhd") {
      if (ver === 1) { dv.setUint32(base + 24, Math.floor(dur / 4294967296)); dv.setUint32(base + 28, dur >>> 0); }
      else dv.setUint32(base + 16, Math.min(dur, 0xffffffff));
    } else { // mvhd & mdhd: ctime, mtime, timescale, duration
      if (ver === 1) { dv.setUint32(base + 20, Math.floor(dur / 4294967296)); dv.setUint32(base + 24, dur >>> 0); }
      else dv.setUint32(base + 12, Math.min(dur, 0xffffffff));
    }
    return c;
  }
  function timescaleOf(u8, dv, b) { const ver = u8[b.hdr + b.o]; return u32(dv, b.s + 4 + (ver === 1 ? 16 : 8)); }

  function remuxMp4(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    const top = boxes(u8, dv, 0, u8.length);
    const ftyp = find(top, "ftyp"), moov = find(top, "moov");
    if (!ftyp || !moov || !top.some(b => b.t === "moof")) return null; // bukan fragmented MP4: tidak perlu diubah
    const mk = boxes(u8, dv, moov.s, moov.e);
    const mvhd = find(mk, "mvhd"); const movieTs = timescaleOf(u8, dv, mvhd);
    const trex = {};
    const mvex = find(mk, "mvex");
    if (mvex) for (const b of boxes(u8, dv, mvex.s, mvex.e)) if (b.t === "trex") {
      const p = b.s + 4; trex[u32(dv, p)] = { sdi: u32(dv, p + 4), dur: u32(dv, p + 8), size: u32(dv, p + 12), flags: u32(dv, p + 16) };
    }
    const tracks = {};
    for (const tb of mk.filter(b => b.t === "trak")) {
      const tk = boxes(u8, dv, tb.s, tb.e);
      const tkhd = find(tk, "tkhd"), ver = u8[tkhd.s];
      const id = u32(dv, tkhd.s + 4 + (ver === 1 ? 16 : 8));
      const mdia = find(tk, "mdia"), md = boxes(u8, dv, mdia.s, mdia.e);
      const mdhd = find(md, "mdhd"), hdlr = find(md, "hdlr"), minf = find(md, "minf");
      const mi = boxes(u8, dv, minf.s, minf.e), stbl = find(mi, "stbl"), st = boxes(u8, dv, stbl.s, stbl.e);
      tracks[id] = { id, tb, tk, tkhd, mdia, md, mdhd, hdlr, minf, mi, stbl, stsd: find(st, "stsd"), ts: timescaleOf(u8, dv, mdhd),
        handler: typ(u8, hdlr.s + 8), samples: [], chunks: [] };
    }
    // Kumpulkan sampel dari semua fragmen
    for (const mf of top.filter(b => b.t === "moof")) {
      for (const tf of boxes(u8, dv, mf.s, mf.e).filter(b => b.t === "traf")) {
        const tb = boxes(u8, dv, tf.s, tf.e), tfhd = find(tb, "tfhd");
        const fl = (u8[tfhd.s + 1] << 16) | (u8[tfhd.s + 2] << 8) | u8[tfhd.s + 3];
        let p = tfhd.s + 4; const id = u32(dv, p); p += 4;
        const tr = tracks[id], dx = trex[id] || { dur: 0, size: 0, flags: 0 };
        if (!tr) continue;
        let base = mf.o;
        if (fl & 0x1) { base = u64(dv, p); p += 8; }
        if (fl & 0x2) p += 4;
        const dDur = fl & 0x8 ? (p += 4, u32(dv, p - 4)) : dx.dur;
        const dSize = fl & 0x10 ? (p += 4, u32(dv, p - 4)) : dx.size;
        const dFlags = fl & 0x20 ? (p += 4, u32(dv, p - 4)) : dx.flags;
        let next = base;
        for (const tn of tb.filter(b => b.t === "trun")) {
          const v = u8[tn.s], f = (u8[tn.s + 1] << 16) | (u8[tn.s + 2] << 8) | u8[tn.s + 3];
          let q = tn.s + 4; const n = u32(dv, q); q += 4;
          let off = next;
          if (f & 0x1) { off = base + dv.getInt32(q); q += 4; }
          let first = null; if (f & 0x4) { first = u32(dv, q); q += 4; }
          const chunk = { off, n, bytes: 0 };
          for (let i = 0; i < n; i++) {
            const dur = f & 0x100 ? (q += 4, u32(dv, q - 4)) : dDur;
            const size = f & 0x200 ? (q += 4, u32(dv, q - 4)) : dSize;
            let flags = f & 0x400 ? (q += 4, u32(dv, q - 4)) : (i === 0 && first != null ? first : dFlags);
            if (i === 0 && first != null && f & 0x400) flags = first;
            const cts = f & 0x800 ? (q += 4, v === 1 ? dv.getInt32(q - 4) : u32(dv, q - 4)) : 0;
            tr.samples.push({ dur, size, sync: !(flags & 0x10000), cts });
            chunk.bytes += size;
          }
          if (n) tr.chunks.push(chunk);
          next = off + chunk.bytes;
        }
      }
    }
    const list = Object.values(tracks).filter(t => t.samples.length);
    if (!list.length) return null;

    // Susunan data baru: potongan (chunk) diurutkan sesuai posisi aslinya
    const allChunks = list.flatMap(t => t.chunks.map(c => ({ ...c, t }))).sort((a, b) => a.off - b.off);
    const mdatLen = allChunks.reduce((a, c) => a + c.bytes, 0);
    const big = mdatLen + 1e6 > 0xffffffff;

    const buildMoov = mdatStart => {
      let pos = mdatStart; const newOff = new Map();
      for (const c of allChunks) { newOff.set(c, pos); pos += c.bytes; }
      let movieDur = 0;
      const traks = list.map(t => {
        const mediaDur = t.samples.reduce((a, s) => a + s.dur, 0);
        const mvDur = Math.round(mediaDur * movieTs / t.ts); movieDur = Math.max(movieDur, mvDur);
        // stts
        const stts = []; for (const s of t.samples) { const l = stts[stts.length - 1]; if (l && l[1] === s.dur) l[0]++; else stts.push([1, s.dur]); }
        const sttsB = fullBox("stts", 0, 0, u32arr([stts.length, ...stts.flat()]));
        // ctts (bila ada)
        let cttsB = null;
        if (t.samples.some(s => s.cts)) {
          const c = []; for (const s of t.samples) { const l = c[c.length - 1]; if (l && l[1] === s.cts) l[0]++; else c.push([1, s.cts]); }
          const neg = c.some(([, o]) => o < 0);
          const body = new Uint8Array(4 + c.length * 8), bd = new DataView(body.buffer); bd.setUint32(0, c.length);
          c.forEach(([n, o], i) => { bd.setUint32(4 + i * 8, n); neg ? bd.setInt32(8 + i * 8, o) : bd.setUint32(8 + i * 8, o); });
          cttsB = fullBox("ctts", neg ? 1 : 0, 0, body);
        }
        // stss (hanya bila ada sampel bukan-kunci)
        let stssB = null;
        if (t.samples.some(s => !s.sync)) { const k = []; t.samples.forEach((s, i) => s.sync && k.push(i + 1)); stssB = fullBox("stss", 0, 0, u32arr([k.length, ...k])); }
        // stsc
        const tc = allChunks.filter(c => c.t === t), stsc = [];
        tc.forEach((c, i) => { const l = stsc[stsc.length - 1]; if (!l || l[1] !== c.n) stsc.push([i + 1, c.n, 1]); });
        const stscB = fullBox("stsc", 0, 0, u32arr([stsc.length, ...stsc.flat()]));
        const stszB = fullBox("stsz", 0, 0, u32arr([0, t.samples.length, ...t.samples.map(s => s.size)]));
        let stcoB;
        if (big) {
          const body = new Uint8Array(4 + tc.length * 8), bd = new DataView(body.buffer); bd.setUint32(0, tc.length);
          tc.forEach((c, i) => { const v = newOff.get(c); bd.setUint32(4 + i * 8, Math.floor(v / 4294967296)); bd.setUint32(8 + i * 8, v >>> 0); });
          stcoB = fullBox("co64", 0, 0, body);
        } else stcoB = fullBox("stco", 0, 0, u32arr([tc.length, ...tc.map(c => newOff.get(c))]));
        const stbl = box("stbl", u8.slice(t.stsd.o, t.stsd.e), sttsB, ...(cttsB ? [cttsB] : []), ...(stssB ? [stssB] : []), stscB, stszB, stcoB);
        const minf = box("minf", ...t.mi.filter(b => b.t !== "stbl").map(b => u8.slice(b.o, b.e)), stbl);
        const mdia = box("mdia", ...t.md.map(b => b.t === "mdhd" ? withDuration(u8, b, "mdhd", mediaDur) : b.t === "minf" ? minf : u8.slice(b.o, b.e)));
        const trak = box("trak", ...t.tk.filter(b => b.t !== "edts").map(b => b.t === "tkhd" ? withDuration(u8, b, "tkhd", mvDur) : b.t === "mdia" ? mdia : u8.slice(b.o, b.e)));
        return trak;
      });
      return box("moov", withDuration(u8, mvhd, "mvhd", movieDur), ...mk.filter(b => b.t !== "mvhd" && b.t !== "trak" && b.t !== "mvex").map(b => u8.slice(b.o, b.e)), ...traks);
    };
    const ftypB = u8.slice(ftyp.o, ftyp.e);
    const mdatHdr = big ? 16 : 8;
    const probe = buildMoov(0); // ukuran moov tidak bergantung pada nilai offset
    const mdatStart = ftypB.length + probe.length + mdatHdr;
    const moovB = buildMoov(mdatStart);
    const hdr = new Uint8Array(mdatHdr), hv = new DataView(hdr.buffer);
    if (big) { hv.setUint32(0, 1); hdr.set([109, 100, 97, 116], 4); hv.setUint32(8, Math.floor((mdatLen + 16) / 4294967296)); hv.setUint32(12, (mdatLen + 16) >>> 0); }
    else { hv.setUint32(0, mdatLen + 8); hdr.set([109, 100, 97, 116], 4); }
    const parts = [ftypB, moovB, hdr, ...allChunks.map(c => u8.subarray(c.off, c.off + c.bytes))];
    return parts;
  }

  // ---- WebM: sisipkan Duration ke Segment > Info
  function vintLen(b) { let l = 1, m = 0x80; while (l <= 8 && !(b & m)) { l++; m >>= 1; } return l; }
  function readVint(u8, o) { const l = vintLen(u8[o]); let v = u8[o] & (0xff >> l); for (let i = 1; i < l; i++) v = v * 256 + u8[o + i]; return { l, v, unknown: v === Math.pow(2, 7 * l) - 1 }; }
  function readId(u8, o) { const l = vintLen(u8[o]); let v = 0; for (let i = 0; i < l; i++) v = v * 256 + u8[o + i]; return { l, v }; }
  function sizeVint(n) { const b = new Uint8Array(8); b[0] = 0x01; let x = n; for (let i = 7; i >= 1; i--) { b[i] = x % 256; x = Math.floor(x / 256); } return b; }
  function fixWebm(buf, durSec) {
    const u8 = new Uint8Array(buf);
    let o = 0;
    const ebml = readId(u8, o); if (ebml.v !== 0x1A45DFA3) return null;
    const es = readVint(u8, o + ebml.l); o += ebml.l + es.l + es.v;
    const seg = readId(u8, o); if (seg.v !== 0x18538067) return null;
    const ss = readVint(u8, o + seg.l); const segData = o + seg.l + ss.l;
    let p = segData;
    while (p < u8.length) {
      const id = readId(u8, p), sz = readVint(u8, p + id.l), dataStart = p + id.l + sz.l;
      if (id.v === 0x1549A966) { // Info
        let q = dataStart, scale = 1000000, hasDur = false; const end = dataStart + sz.v;
        while (q < end) { const cid = readId(u8, q), cs = readVint(u8, q + cid.l), cd = q + cid.l + cs.l;
          if (cid.v === 0x2AD7B1) { scale = 0; for (let i = 0; i < cs.v; i++) scale = scale * 256 + u8[cd + i]; }
          if (cid.v === 0x4489) hasDur = true;
          q = cd + cs.v; }
        if (hasDur) return null;
        const durEl = new Uint8Array(11); durEl.set([0x44, 0x89, 0x88]); new DataView(durEl.buffer).setFloat64(3, durSec * 1e9 / scale);
        const newInfo = [u8.subarray(p, p + id.l), sizeVint(sz.v + durEl.length), u8.subarray(dataStart, end), durEl];
        return [u8.subarray(0, p), ...newInfo, u8.subarray(end)];
      }
      if (id.v === 0x1F43B675 || sz.unknown) break; // sampai Cluster: Info tidak ditemukan
      p = dataStart + sz.v;
    }
    return null;
  }

  async function fix(blob, durSec) {
    try {
      if (!blob || !blob.size) return blob;
      const buf = await blob.arrayBuffer();
      const type = (blob.type || "").split(";")[0];
      const head = new Uint8Array(buf, 0, Math.min(12, buf.byteLength));
      const isMp4 = head.length >= 8 && String.fromCharCode(head[4], head[5], head[6], head[7]) === "ftyp";
      const isWebm = head[0] === 0x1A && head[1] === 0x45 && head[2] === 0xDF && head[3] === 0xA3;
      const parts = isMp4 ? remuxMp4(buf) : isWebm ? fixWebm(buf, durSec || 0) : null;
      if (!parts) return blob;
      return new Blob(parts, { type: type || (isMp4 ? "video/mp4" : "video/webm") });
    } catch (e) { console.warn("KKAFix:", e); return blob; }
  }
  // Sudah rapi? (MP4 tanpa moof, atau WebM dengan Duration)
  async function needsFix(blob) {
    try {
      const buf = await blob.slice(0, Math.min(blob.size, 4 * 1024 * 1024)).arrayBuffer(), u8 = new Uint8Array(buf), dv = new DataView(buf);
      if (u8.length >= 8 && typ(u8, 4) === "ftyp") return boxes(u8, dv, 0, u8.length).some(b => b.t === "moof") || /moof/.test(String.fromCharCode.apply(null, u8.subarray(0, Math.min(u8.length, 65536))));
      if (u8[0] === 0x1A && u8[1] === 0x45) return !!fixWebm(buf, 1);
    } catch (e) {}
    return false;
  }
  window.KKAFix = { fix, needsFix };
})();

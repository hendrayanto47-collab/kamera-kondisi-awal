/* Penghubung ke Supabase lewat REST API (tanpa library, agar ringan dan tetap jalan offline).
   Menyediakan window.SB: login, logout, upload, remove, upsertRow. */
(function () {
  const C = window.APP_CONFIG || {};
  const enabled = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY &&
    !C.SUPABASE_URL.includes("xxxxxxxx") && !C.SUPABASE_ANON_KEY.includes("ISI_"));
  const base = (C.SUPABASE_URL || "").replace(/\/+$/, "");
  const SESSION_KEY = "kka-session";

  let s = null;
  try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) {}
  const saveSession = () => {
    try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (e) {}
  };

  async function authToken(grant, body) {
    const r = await fetch(`${base}/auth/v1/token?grant_type=${grant}`, {
      method: "POST",
      headers: { apikey: C.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j.error_description || j.msg || j.message || "";
      throw new Error(/invalid login/i.test(msg) ? "Email atau kata sandi salah." : "Login gagal: " + (msg || r.status));
    }
    s = {
      access: j.access_token, refresh: j.refresh_token,
      exp: Date.now() + (j.expires_in || 3600) * 1000,
      email: (j.user && j.user.email) || (s && s.email) || "",
    };
    saveSession();
    return s;
  }

  async function token() {
    if (!s) throw new Error("Belum login ke Supabase.");
    if (Date.now() > s.exp - 60000) {
      try { await authToken("refresh_token", { refresh_token: s.refresh }); }
      catch (e) {
        if (!navigator.onLine) throw new Error("Tidak ada internet.");
        s = null; saveSession(); throw new Error("Sesi login berakhir. Silakan login ulang.");
      }
    }
    return s.access;
  }

  const encPath = p => p.split("/").map(encodeURIComponent).join("/");
  async function headers(extra) {
    return { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + (await token()), ...extra };
  }
  async function check(r, what) {
    if (r.ok) return;
    let t = ""; try { t = await r.text(); } catch (e) {}
    if (r.status === 401 || r.status === 403) throw new Error(`${what} ditolak (${r.status}). Periksa kebijakan RLS di Supabase.`);
    if (r.status === 404 && what === "Upload") throw new Error(`Bucket "${C.BUCKET}" tidak ditemukan di Supabase.`);
    throw new Error(`${what} gagal (${r.status}) ${t.slice(0, 120)}`);
  }

  window.SB = {
    enabled,
    get session() { return s; },
    login: (email, password) => authToken("password", { email, password }),
    async logout() {
      try { await fetch(`${base}/auth/v1/logout`, { method: "POST", headers: await headers() }); } catch (e) {}
      s = null; saveSession();
    },
    async upload(path, blob) {
      const r = await fetch(`${base}/storage/v1/object/${C.BUCKET}/${encPath(path)}`, {
        method: "POST",
        headers: await headers({ "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "3600" }),
        body: blob,
      });
      await check(r, "Upload");
    },
    async remove(path) {
      const r = await fetch(`${base}/storage/v1/object/${C.BUCKET}/${encPath(path)}`, {
        method: "DELETE", headers: await headers(),
      });
      if (r.status !== 404) await check(r, "Hapus file lama");
    },
    async upsertRow(row) {
      const r = await fetch(`${base}/rest/v1/${C.TABLE}?on_conflict=npsn,paket,sudut`, {
        method: "POST",
        headers: await headers({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(row),
      });
      await check(r, "Simpan data");
    },
  };
})();

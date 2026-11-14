/* Sinkron antar-HP lewat akun Google + Google Drive (tanpa server sendiri).
   - Masuk dengan Google (OAuth 2, alur pengalihan) memakai izin drive.file:
     aplikasi hanya bisa melihat/mengubah file yang dibuatnya sendiri di Drive akun itu.
   - Semua HP yang masuk dengan akun yang sama melihat file yang sama.
   Menyediakan window.GD. */
(function () {
  const C = window.APP_CONFIG || {};
  const CLIENT_ID = (C.GOOGLE_CLIENT_ID || "").trim();
  const enabled = /\.apps\.googleusercontent\.com$/.test(CLIENT_ID);
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const API = "https://www.googleapis.com/drive/v3";
  const UP = "https://www.googleapis.com/upload/drive/v3";
  const TOKEN_KEY = "kka-gtoken", FOLD_KEY = "kka-gfold";
  const redirectUri = () => new URL("./", location.href).href;

  let tok = null;
  try { tok = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); } catch (e) {}
  const saveTok = () => { try { tok ? localStorage.setItem(TOKEN_KEY, JSON.stringify(tok)) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} };

  let GDjustLoggedIn = false, GDloginError = null;
  // Kembali dari halaman masuk Google: token ada di #fragment
  (function readRedirect() {
    if (!/access_token=/.test(location.hash)) return;
    const q = new URLSearchParams(location.hash.slice(1));
    let st = null; try { st = sessionStorage.getItem("kka-gstate"); sessionStorage.removeItem("kka-gstate"); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search);
    if (!st || q.get("state") !== st) return; // tolak respons yang bukan permintaan kita
    tok = { access: q.get("access_token"), exp: Date.now() + (+q.get("expires_in") || 3600) * 1000 - 60000, email: (tok && tok.email) || "" };
    saveTok();
    GDjustLoggedIn = true;
  })();
  (function readError() {
    if (!/[#&]error=/.test(location.hash)) return;
    const q = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname + location.search);
    GDloginError = q.get("error");
  })();

  function login(force) {
    if (!enabled) return;
    const st = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { sessionStorage.setItem("kka-gstate", st); } catch (e) {}
    const p = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: redirectUri(), response_type: "token", scope: SCOPE,
      include_granted_scopes: "true", state: st, prompt: !force && tok && tok.email ? "none" : "select_account" });
    if (tok && tok.email) p.set("login_hint", tok.email);
    location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + p;
  }
  function logout() {
    if (tok && tok.access) fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(tok.access), { method: "POST" }).catch(() => {});
    tok = null; saveTok();
    try { localStorage.removeItem(FOLD_KEY); } catch (e) {}
  }
  const valid = () => !!(tok && tok.access && Date.now() < tok.exp);

  class AuthError extends Error {}
  async function req(url, opt = {}, raw) {
    if (!valid()) throw new AuthError("Perlu masuk Google lagi.");
    const r = await fetch(url, { ...opt, headers: { Authorization: "Bearer " + tok.access, ...(opt.headers || {}) } });
    if (r.status === 401) { tok.exp = 0; saveTok(); throw new AuthError("Perlu masuk Google lagi."); }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const e = new Error((j.error && j.error.message) || "Drive " + r.status); e.status = r.status; throw e;
    }
    return raw ? r : r.status === 204 ? null : r.json();
  }

  async function me() {
    const j = await req(API + "/about?fields=user(emailAddress,displayName)");
    tok.email = j.user.emailAddress; tok.name = j.user.displayName; saveTok();
    return j.user;
  }

  const esc = s => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const propQ = o => Object.entries(o).map(([k, v]) => `appProperties has { key='${k}' and value='${esc(v)}' }`).join(" and ");

  async function list(props, fields = "id,name,modifiedTime,size,mimeType,appProperties,parents") {
    const out = []; let page = "";
    do {
      const q = encodeURIComponent(propQ(props) + " and trashed=false");
      const j = await req(`${API}/files?q=${q}&pageSize=1000&fields=nextPageToken,files(${fields})${page ? "&pageToken=" + page : ""}`);
      out.push(...j.files); page = j.nextPageToken || "";
    } while (page);
    return out;
  }

  /* Folder: dicari lewat appProperties (role, path, npsn), dibuat bila belum ada. Hasil disimpan sementara. */
  let fold = {};
  try { fold = JSON.parse(localStorage.getItem(FOLD_KEY) || "{}"); } catch (e) {}
  const saveFold = () => { try { localStorage.setItem(FOLD_KEY, JSON.stringify(fold)); } catch (e) {} };
  const inflight = {}; // cegah folder ganda saat beberapa unggahan berjalan bersamaan
  function folder(npsn, path, rootName) {
    const ck = npsn + ":" + path; if (fold[ck]) return Promise.resolve(fold[ck]);
    if (!inflight[ck]) inflight[ck] = folderMake(npsn, path, rootName, ck).finally(() => delete inflight[ck]);
    return inflight[ck];
  }
  async function folderMake(npsn, path, rootName, ck) {
    const parts = path ? path.split("/") : [];
    const parentPath = parts.slice(0, -1).join("/");
    const parent = path ? await folder(npsn, parentPath, rootName) : null;
    const props = { kka: "folder", npsn, path: path || "/" };
    const found = await list(props, "id");
    let id = found.length ? found[0].id : null;
    if (!id) {
      const meta = { name: path ? parts[parts.length - 1] : rootName, mimeType: "application/vnd.google-apps.folder", appProperties: props };
      if (parent) meta.parents = [parent];
      id = (await req(API + "/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta) })).id;
    }
    fold[ck] = id; saveFold();
    return id;
  }
  const forgetFolders = () => { fold = {}; saveFold(); };

  /* Unggah (buat baru atau ganti isi) dengan unggahan resumable: aman untuk video besar. */
  async function put(blob, meta, id) {
    const init = await req(`${UP}/files${id ? "/" + id : ""}?uploadType=resumable&fields=id,modifiedTime`, {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": blob.type || "application/octet-stream" },
      body: JSON.stringify(meta),
    }, true);
    const loc = init.headers.get("Location");
    const r = await fetch(loc, { method: "PUT", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
    if (!r.ok) throw new Error("Unggah gagal (" + r.status + ")");
    return r.json();
  }
  async function move(id, addParent, meta) {
    const f = await req(`${API}/files/${id}?fields=parents`);
    const rm = (f.parents || []).filter(p => p !== addParent).join(",");
    return req(`${API}/files/${id}?addParents=${addParent}${rm ? "&removeParents=" + rm : ""}&fields=id,modifiedTime`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta || {}) });
  }
  const download = id => req(`${API}/files/${id}?alt=media`, {}, true).then(r => r.blob());
  const trash = id => req(`${API}/files/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"trashed":true}' })
    .catch(e => { if (e.status !== 404) throw e; });
  async function makePublic(id) {
    await req(`${API}/files/${id}/permissions?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }) });
    return "https://drive.google.com/drive/folders/" + id;
  }

  window.GD = {
    enabled, login, logout, me, list, folder, forgetFolders, put, move, download, trash, makePublic, AuthError,
    get valid() { return valid(); },
    get email() { return tok && tok.email; },
    get known() { return !!(tok && (tok.email || tok.access)); },
    get justLoggedIn() { return GDjustLoggedIn; },
    get loginError() { return GDloginError; },
  };
})();

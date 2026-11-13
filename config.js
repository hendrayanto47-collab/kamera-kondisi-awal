/* ==== PENGATURAN SUPABASE ====
   Ambil dua nilai ini dari Supabase: Project Settings → API (atau "API Keys").
   - SUPABASE_URL      : Project URL, contoh https://abcdefgh.supabase.co
   - SUPABASE_ANON_KEY : kunci "anon public" / "publishable" (BUKAN service_role / secret!)
   Kunci anon aman ditaruh di sini karena data dilindungi login + Row Level Security.
   Biarkan seperti contoh di bawah bila aplikasi hanya dipakai offline tanpa Supabase. */
window.APP_CONFIG = {
  /* Client ID Google (OAuth, jenis "Web application") untuk sinkron antar-HP lewat Google Drive.
     Berakhiran .apps.googleusercontent.com. Bukan rahasia; JANGAN taruh Client secret di sini. */
  GOOGLE_CLIENT_ID: "",
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "ISI_ANON_KEY_DI_SINI",
  BUCKET: "foto-kondisi-awal",
  TABLE: "foto_kondisi_awal",
};

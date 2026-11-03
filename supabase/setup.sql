-- =====================================================================
-- Setup Supabase untuk Kamera Foto Kondisi Awal
-- Jalankan sekali di Supabase: SQL Editor → New query → tempel → Run
-- =====================================================================

-- 1) Tabel data foto
create table if not exists public.foto_kondisi_awal (
  id            bigint generated always as identity primary key,
  npsn          text        not null,
  nama_sekolah  text        not null,
  wilayah       text,
  paket         text        not null,   -- contoh: Kelas 1
  sudut         text        not null,   -- Tampak Depan / Tampak Belakang / Tampak Samping / Dalam Ruang
  diambil_pada  timestamptz not null,
  lat           double precision,
  lng           double precision,
  akurasi_m     integer,
  storage_path  text        not null,   -- lokasi file di bucket
  diunggah_oleh uuid        default auth.uid() references auth.users(id),
  diperbarui    timestamptz default now(),
  unique (npsn, paket, sudut)           -- 1 foto per sudut per paket per sekolah
);

alter table public.foto_kondisi_awal enable row level security;

-- Hanya pengguna yang sudah login yang boleh membaca dan menulis
drop policy if exists "login boleh baca"   on public.foto_kondisi_awal;
drop policy if exists "login boleh tambah" on public.foto_kondisi_awal;
drop policy if exists "login boleh ubah"   on public.foto_kondisi_awal;
create policy "login boleh baca"   on public.foto_kondisi_awal for select to authenticated using (true);
create policy "login boleh tambah" on public.foto_kondisi_awal for insert to authenticated with check (true);
create policy "login boleh ubah"   on public.foto_kondisi_awal for update to authenticated using (true) with check (true);

-- 2) Bucket penyimpanan foto (privat, maks 10 MB per file, hanya JPG)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto-kondisi-awal', 'foto-kondisi-awal', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

-- 3) Izin bucket: hanya pengguna login
drop policy if exists "kka baca"   on storage.objects;
drop policy if exists "kka unggah" on storage.objects;
drop policy if exists "kka timpa"  on storage.objects;
drop policy if exists "kka hapus"  on storage.objects;
create policy "kka baca"   on storage.objects for select to authenticated using (bucket_id = 'foto-kondisi-awal');
create policy "kka unggah" on storage.objects for insert to authenticated with check (bucket_id = 'foto-kondisi-awal');
create policy "kka timpa"  on storage.objects for update to authenticated using (bucket_id = 'foto-kondisi-awal');
create policy "kka hapus"  on storage.objects for delete to authenticated using (bucket_id = 'foto-kondisi-awal');

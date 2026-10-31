# Catatan Progres — Sistem Pendaftaran Multi-Event

Acuan: `PRD — Sistem Pendaftaran Multi-Event.md`, urutan tahap dari bagian 12. Catatan terbaru ditambahkan di bawah.

## Status tahap

| # | Tahap | Status |
| --- | --- | --- |
| 1 | Fondasi | Selesai |
| 2 | Auth | Selesai |
| 3 | Event | Selesai |
| 4 | Pendaftaran | Selesai |
| 5 | Verifikasi | Selesai |
| 6 | Notifikasi | Selesai |
| 7 | Laporan | Selesai |
| 8 | Frontend publik dan pendaftar | Berjalan |
| 9 | Frontend admin | Belum |
| 10 | Penutup | Belum |

## Log

### 31 Okt 2026 — Persiapan

- Tiga perbaikan terakhir dan perapian kecil dimasukkan ke PRD (11 perubahan): `DELETE` hanya saat `DRAFT`, syarat dokumen ikut terkunci di EV-04, urutan `confirm` (I/O di luar transaksi, hapus objek lama setelah commit), sapuan prefix `uploads/`, kolom `uploads.original_name`, `nosniff` di Nginx, pemeriksaan DOCX.
- Pemilik `/opt/pendaftaran` diubah ke user `taufik` atas permintaan pengguna. Repo git dibuat di folder ini.
- Bun 1.4.4 dipasang di level user: `~/.local/bun-install/node_modules/.bin`.

### 31 Okt 2026 — Tahap 1: uji presigned URL lewat Nginx (LOLOS)

Skrip: `apps/api/src/scripts/proxy-signature-check.ts`. Hasil lewat `http://localhost:8080`:

| Uji | Hasil |
| --- | --- |
| Presigned PUT 1 KB dan 2 MB | 200 |
| Presigned PUT 7 MB | 413 (batas Nginx 6 MB) |
| Presigned GET | 200, ukuran sesuai, ada `X-Content-Type-Options: nosniff` |
| Tanda tangan dirusak | 403 |
| GET tanpa tanda tangan | 403 (bucket privat) |
| Host berbeda dari yang ditandatangani | 403 |

Kesimpulan: rencana cadangan (host terpisah atau `STORAGE_DRIVER=local`) tidak diperlukan.

Port yang dipakai karena port 3000 dan lainnya sudah terpakai di server: Nginx `8080`; Postgres `127.0.0.1:55432`; RustFS `127.0.0.1:59000` dan `59001`; Mailpit SMTP `127.0.0.1:51025`, UI `8025`.

### 31 Okt 2026 — Tahap 1–7: backend selesai

- 11 modul, 15 tabel, migration, seed (2 staff, 2 event, 6 jenis dokumen, 24 pendaftar, status beragam).
- `bun test`: **45 lolos, 0 gagal**, terhadap Postgres dan RustFS sungguhan, database uji terpisah (`pendaftaran_test`).
- Uji mutasi: kunci baris event dimatikan sementara, uji 50 submit gagal (3 berhasil, seharusnya 10). Artinya test benar-benar mendeteksi hilangnya kunci. Kunci sudah dipulihkan.
- Kerja berada di worktree `.claude/worktrees/build`, branch `build`, karena pengaman sesi latar belakang mewajibkannya.

Penyimpangan kecil dari PRD:

- **Hono RPC (`hc<AppType>`) tidak dipakai.** Route didaftarkan lewat helper `route()` agar validasi, OpenAPI, dan format respons seragam, sehingga tipe rantai RPC tidak tersedia. Frontend memakai klien `fetch` bertipe dan skema dari `packages/shared`.
- **Access key khusus aplikasi belum dibuat.** `S3_ACCESS_KEY` adalah kredensial root RustFS, tapi nilainya acak dan sudah bukan bawaan.
- **Tambahan di luar daftar API PRD:** `GET /admin/auth/me`, `GET /admin/event-options` (filter untuk operator), `PATCH /admin/registrations/:id/program` (pindah program, PRD 6.4), `DELETE /admin/events/:id/programs/:programId` (EV-02).
- **Middleware sesi ada di modul `auth`**, bukan `shared/http`, karena perlu tabel `sessions`.

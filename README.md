# Sistem Pendaftaran Multi-Event

Aplikasi pendaftaran online: satu akun pendaftar untuk banyak event, verifikasi berkas oleh panitia, dan notifikasi email. Spesifikasi lengkap ada di `PRD — Sistem Pendaftaran Multi-Event.md`, catatan pengerjaan di `PROGRESS.md`.

Stack: Bun, Hono, Drizzle, PostgreSQL, RustFS, Vue 3, Tailwind, Docker Compose.

## Instalasi

```bash
cp .env.example .env
# Isi APP_KEY, POSTGRES_PASSWORD, DATABASE_URL, S3_ACCESS_KEY, S3_SECRET_KEY, SEED_ADMIN_PASSWORD.
# APP_URL dan S3_PUBLIC_ENDPOINT harus sama persis dengan alamat yang dibuka di browser.

docker compose --profile dev up -d --build       # tanpa --profile dev bila memakai SMTP asli
docker compose exec api bun apps/api/src/scripts/init-storage.ts
docker compose exec api bun apps/api/src/scripts/migrate.ts
docker compose exec api bun apps/api/src/scripts/seed.ts
```

Lalu buka:

| Alamat | Isi |
| --- | --- |
| `APP_URL/` | Halaman publik dan pendaftar |
| `APP_URL/login` | Login pendaftar (email) dan panitia (username) |
| `APP_URL/admin` | Panel panitia |
| `APP_URL/docs` | Dokumentasi API (Scalar) |
| `APP_URL/health` | Pemeriksaan database dan storage |
| `http://<server>:8025` | Mailpit, kotak masuk email saat development |

**Akun seed:** `admin` dan `operator`, password dari `SEED_ADMIN_PASSWORD`. Pendaftar dummy: `pendaftar1@contoh.local` sampai `pendaftar24@contoh.local`, password `Pendaftar123`.

## Mengganti SMTP

Buka panel admin → Pengaturan → Email. Untuk Gmail: pilih preset Gmail, isi alamat dan App Password, lalu **Kirim email uji** sebelum menyimpan. Bila panel belum diisi, sistem memakai `SMTP_*` dari `.env`. Di dalam Docker, targetnya mailpit; ganti lewat `SMTP_HOST_DOCKER` dan `SMTP_PORT_DOCKER`.

## Pengembangan

Bun harus terpasang di host.

```bash
bun install
docker compose --profile dev up -d postgres rustfs mailpit nginx
bun run storage:init && bun run db:migrate && bun run db:seed
bun run dev:api      # port 3000
bun run dev:web      # port 5173, proxy /api ke 3000
```

## Pengujian

```bash
bun run test        # butuh postgres dan rustfs jalan; memakai database pendaftaran_test
bun run typecheck
bun run lint        # batas modul
(cd apps/api && bun --env-file=../../.env src/scripts/proxy-signature-check.ts)   # presigned URL lewat Nginx
```

Checklist demo di browser mengubah data (kuota terpakai, status berubah), jadi jalankan di stack terpisah supaya data utama aman. Salin `.env` ke `.env.e2e`, ubah `HTTP_PORT=8081`, `APP_URL` dan `S3_PUBLIC_ENDPOINT` ke port 8081, lalu isi port host lain (lihat bagian opsional di `.env.example`), misalnya `POSTGRES_HOST_PORT=55433`, `RUSTFS_HOST_PORT=59100`, `RUSTFS_CONSOLE_HOST_PORT=59101`, `MAILPIT_SMTP_HOST_PORT=51026`, `MAILPIT_UI_PORT=8026`.

```bash
C="docker compose -p pendaftaran-e2e --env-file .env.e2e --profile dev"
$C up -d --build
for s in init-storage migrate seed; do $C exec api bun apps/api/src/scripts/$s.ts; done
```

Jalankan checklist dengan `E2E_BASE` port 8081 dan `E2E_MAIL` port 8026, lalu buang stack-nya dengan `$C down -v`.

```bash
cd e2e && npm i playwright && npx playwright install chromium
E2E_BASE=<APP_URL> E2E_MAIL=http://<server>:8025/api/v1 node demo-checklist.mjs <SEED_ADMIN_PASSWORD>
```

## Penyimpanan cadangan

Bila RustFS bermasalah, set `STORAGE_DRIVER=local` di `.env` lalu jalankan ulang container `api`. Frontend tidak berubah. Berkas tersimpan di volume `local_files`.

## Sebelum presentasi

- Bekukan versi RustFS: isi `RUSTFS_TAG` di `.env` dengan tag versi yang sudah diuji, jangan `latest`.
- Buka aplikasi persis di alamat `APP_URL`. Alamat lain membuat unggahan gagal, karena tanda tangan URL mengikat host dan port.

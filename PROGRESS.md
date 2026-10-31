# Catatan Progres — Sistem Pendaftaran Multi-Event

Acuan: `PRD — Sistem Pendaftaran Multi-Event.md`, urutan tahap dari bagian 12. Catatan terbaru ditambahkan di bawah.

## Status tahap

| # | Tahap | Status |
| --- | --- | --- |
| 1 | Fondasi | Berjalan |
| 2 | Auth | Belum |
| 3 | Event | Belum |
| 4 | Pendaftaran | Belum |
| 5 | Verifikasi | Belum |
| 6 | Notifikasi | Belum |
| 7 | Laporan | Belum |
| 8 | Frontend publik dan pendaftar | Belum |
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

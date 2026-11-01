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
| 8 | Frontend publik dan pendaftar | Selesai |
| 9 | Frontend admin | Selesai |
| 10 | Penutup | Selesai, kecuali pembekuan tag RustFS (dilakukan H-1) |

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

### 31 Okt 2026 — Tahap 8–10: frontend dan penutup

- 22 halaman Vue: publik, pendaftar (dioptimalkan untuk 360 px), dan panel panitia.
- Dockerfile, Compose lengkap, lint batas modul, README, skrip checklist demo `e2e/demo-checklist.mjs`.

Hasil verifikasi terakhir:

| Pemeriksaan | Hasil |
| --- | --- |
| `bun test` (Postgres + RustFS sungguhan) | 46 lolos, 0 gagal |
| Checklist demo PRD di browser Chromium, lewat Nginx | 20 dari 20 langkah lolos |
| Presigned URL lewat Nginx dengan alamat IP | Lolos semua |
| Daftar pendaftar dengan filter, 10.000 data | Maksimal 43 ms (target 500 ms) |
| `tsc`, `vue-tsc`, `eslint` batas modul | Bersih; pelanggaran sengaja tertangkap |
| Warna grafik `#2563EB`, validator palet | Lolos |

Bug yang ditemukan lewat uji browser dan lint, sudah diperbaiki:

- Mengetik jenis dokumen yang sudah ada di master gagal 409 dan tidak mencentangnya. Sekarang langsung tercentang.
- Institusi dan pendidikan kosong tersimpan sebagai string kosong, sehingga tampil kosong, bukan "—".
- Tombol status berbahasa Inggris. Sekarang Mulai tinjau, Terima, Tolak, Waiting List.
- Grafik harian bergelombang palsu karena smoothing. Sekarang garis lurus antar titik.
- Header COOP memicu peringatan di HTTP. Sekarang hanya aktif saat HTTPS.
- `settings.routes` melanggar arah dependensi. Dipindah ke lapisan perakitan `apps/api/src/settings.routes.ts`.

Penyimpangan tambahan dari PRD:

- **Reka UI hanya dipakai untuk Dialog dan Toast.** Select memakai elemen bawaan browser karena lebih nyaman di HP. Tabs, Tooltip, Combobox, dan DropdownMenu belum diperlukan oleh halaman mana pun.
- **`ParticipantLayout` digabung ke `PublicLayout`**, karena isinya sama.

Belum teruji:

- Pengiriman lewat Gmail sungguhan. Yang diuji hanya SMTP ke Mailpit.
- HTTPS, dan worker sebagai container terpisah.
- Driver `local` hanya diuji lewat `bun test`, tidak lewat Nginx.

Sebelum presentasi: isi `RUSTFS_TAG` dengan tag versi yang sudah diuji.

### 1 Nov 2026 — Desain baru mengikuti referensi Pinterest

- Gaya baru di seluruh aplikasi: latar abu-krem, aksen hijau lime, tombol pill, kartu bersudut besar, font Outfit. Sidebar admin tetap ada, sekarang gelap dan mengapung dengan menu aktif berwarna lime.
- Landing dirombak: hero dengan kartu gradien dan lingkaran konsentris, tile event, pita lime berisi 4 langkah. Isi kartu hero diambil dari event sungguhan. Logo dan merek pada gambar referensi tidak ditiru.
- Top nav dipertahankan untuk halaman publik dan pendaftar, karena pendaftar dioptimalkan untuk HP.
- **Palet spesifikasi dosen (navy-biru) diganti** atas permintaan pengguna, dan PRD bagian 1, 4, dan 9 sudah disesuaikan. Warna badge status tetap sesuai PRD. Semua warna ada di `apps/web/src/styles.css`.

### 1 Nov 2026 — Jalan ke pendaftaran event dari halaman pendaftar

- Temuan pengguna: setelah login, halaman `/me` tidak punya jalan menuju daftar event.
- Perbaikan: menu **Event** di header, dan bagian **Event yang bisa didaftar** di `/me`. Lebar isi halaman disamakan dengan header.

### 1 Nov 2026 — Satu halaman login

- Atas usul pengguna, login panitia dan pendaftar disatukan di `/login` dengan isian **Email atau username**. Isian yang memuat `@` diperiksa ke akun pendaftar, selain itu ke akun staff. Setelah masuk, staff diarahkan ke `/admin` dan pendaftar ke `/me`.
- `/admin/login` dialihkan ke `/login`. Endpoint `POST /admin/auth/login` dihapus, diganti `POST /auth/login`.
- Tabel, cookie, dan masa berlaku sesi tetap terpisah. Pesan gagal login sama untuk semua jenis akun, dan rate limit tetap per akun + IP.
- Regresi penuh sekarang berjalan di stack Docker terpisah (`-p pendaftaran-e2e`), jadi tidak menyentuh data di stack utama.

### 1 Nov 2026 — Bug urutan dokumen

- Uji browser gagal sesekali di langkah kuota penuh. Dugaan awal (masalah waktu di skrip) ternyata salah. Daftar dokumen diambil tanpa `ORDER BY`, sehingga urutannya bisa berubah setelah UPDATE, dan dokumen melompat posisi di layar staff setelah diverifikasi.
- Perbaikan: dokumen selalu diurutkan menurut nama jenis, ditambah satu test.

### 1 Nov 2026 — PRD disinkronkan dengan aplikasi

- Disesuaikan: login satu halaman (AK-03), klien API tanpa Hono RPC, layout, Reka UI, halaman `/me`, endpoint tambahan, langkah instalasi, dan urutan dokumen.

### 1 Nov 2026 — Desain halaman login

- Mengikuti referensi kedua dari pengguna: kartu dua panel, ilustrasi di kiri, form dengan input bergaris bawah di kanan, warna hijau yang sudah dipakai. Ilustrasi digambar sendiri.
- Login sosial dan "Remember me" tidak dibuat: SSO di luar lingkup PRD, dan masa sesi sudah tetap.

### 1 Nov 2026 — Font dan panel login diganti

- Masukan pengguna: tampilan terasa "AI slop". Font Outfit diganti Schibsted Grotesk. Ilustrasi buatan sendiri di panel login dibuang, diganti tipografi besar dan daftar event sungguhan.

### 1 Nov 2026 — Dashboard dilengkapi

- Mengikuti referensi pengguna, dengan data sungguhan: banner sambutan, 4 kartu ringkasan, antrean verifikasi, event yang buka, kalender tenggat, jumlah per status, program terbanyak, pendaftaran terbaru, dan peringatan email gagal khusus admin.
- Donut dan grafik bertumpuk seperti di referensi tidak dipakai: validator palet menolak lima warna status (biru dan ungu ΔE 0,4 bagi pembaca buta warna). Status memakai bar satu warna, dengan badge dan angka di tiap baris.

### 1 Nov 2026 — Indikator tahapan untuk peserta

- Permintaan pengguna: alur pendaftaran terlihat oleh peserta. Ditambahkan indikator 4 tahap di `/me` dan halaman pendaftaran: Lengkapi berkas, Terkirim, Ditinjau panitia, Hasil. Tiap tahap menampilkan waktu, dan ada satu kalimat tentang apa yang terjadi atau harus dilakukan.
- Contoh yang diberikan pengguna (URL di jaringan lokal) tidak bisa dibuka karena butuh URL lengkap dengan `?key=`, jadi belum dibandingkan.

### 1 Nov 2026 — Audit dokumentasi

- PRD: halaman `/me` dan form, variabel `.env`, daftar test otomatis, dan checklist demo disesuaikan.
- README: perintah uji presigned yang salah diperbaiki, cara menjalankan checklist di stack terpisah ditambahkan.
- `.env.example`: variabel opsional ditambahkan.

### 1 Nov 2026 — Halaman penjelasan untuk dosen

- Ringkasan sistem, arsitektur, alur, pengujian, batasan, urutan demo, dan contoh pertanyaan. Salinan ada di `docs/penjelasan-sistem/index.html`.

# PRD — Sistem Pendaftaran Multi-Event

Oct 31, 2026 · @Moh Taufik

## 1. Ringkasan

Aplikasi pendaftaran online multi-event: satu akun pendaftar dipakai untuk banyak event (PMB, pelatihan, seminar, kegiatan), admin memverifikasi berkas, dan status dikabarkan lewat email. PRD ini mengembangkan spesifikasi "Registration Management System" (Prompt 1) dengan stack TypeScript + Bun menggantikan Google Apps Script.

Tujuan produk:

- **Pendaftar** membuat akun sekali, lalu mendaftar ke event mana pun yang dibuka, mengunggah berkas, dan memantau status.
- **Admin dan operator** mengelola event, kuota, dan verifikasi, lalu menarik laporan.
- **Data tetap konsisten** walau banyak orang berebut kuota di detik yang sama.

### Perubahan dari spesifikasi dosen

| Spesifikasi asli | Di PRD ini | Alasan |
| --- | --- | --- |
| Google Apps Script + `google.script.run` | Bun + Hono, REST API | Stack yang biasa dipakai, bisa diuji per endpoint |
| Google Sheets (`REGISTRATION_DB`) | PostgreSQL + Drizzle ORM | Relasi, transaksi, dan constraint unik di level database |
| Google Drive | RustFS (S3) lewat client S3 bawaan Bun, cadangan disk lokal | MinIO sudah diarsipkan; storage dibuat bisa diganti |
| `CONFIG` satu baris | Tabel `events` | Banyak event bisa dibuka bersamaan, kuota per event |
| `REGISTRANTS` | `participants` (akun) + `registrations` (pendaftaran per event) | Normalisasi: data orang tidak ditulis ulang per event |
| Cek status pakai nomor + token | Login akun pendaftar | Lebih aman, semua pendaftaran terlihat di satu tempat |
| `USERS` login dengan email | `staff_users` login dengan username, lewat halaman login yang sama dengan pendaftar | Email bisa berubah, username tetap; pengguna tidak perlu tahu alamat login khusus |
| `document_url` di `REGISTRANTS` | Dihapus, cukup tabel `documents` | Satu pendaftaran bisa punya banyak berkas |
| `LockService` | Transaksi + `SELECT ... FOR UPDATE` | Kuota dan nomor registrasi dijamin tidak dobel |
| `MailApp` | SMTP (nodemailer) lewat outbox, diatur dari panel admin | Pengirim bisa diganti ke domain sendiri tanpa ubah kode |
| Script Properties | `.env` + tabel `settings` | Rahasia di `.env`, pengaturan operasional di panel |
| Deploy sebagai Web App | Docker Compose di server lokal | Presentasi dari server sendiri |
| Bootstrap 5, palet navy-biru | Tailwind CSS, palet hijau lime | Preferensi tampilan; token warna ada di satu file sehingga palet bisa dikembalikan |

## 2. Ruang lingkup

Versi demo wajib menjalankan seluruh alur dari daftar akun sampai laporan dengan data asli di database, tanpa data simulasi. Fitur di luar itu dicatat sebagai *nice-to-have* atau pengembangan lanjutan.

**Wajib (versi presentasi)**

- Akun pendaftar: registrasi, verifikasi email dengan OTP, login, lupa password, kelola profil.
- Event: CRUD event, program pilihan, syarat dokumen per event, dua mode kuota.
- Pendaftaran: draft, unggah dokumen ke S3, submit dengan pengecekan kuota, nomor registrasi otomatis, bukti pendaftaran.
- Verifikasi: daftar pendaftar dengan cari dan filter, detail, verifikasi per dokumen, perubahan status sesuai alur.
- Notifikasi email: OTP, bukti pendaftaran, perubahan status, tercatat di outbox.
- Dashboard: ringkasan per status, grafik harian/bulanan, sisa kuota.
- Laporan: export CSV dan Excel, laporan cetak (PDF dari browser).
- Staff user dengan role ADMIN dan OPERATOR, activity log, pengaturan email dari panel.
- Seed: 1 admin, 1 operator, 2 event (mode seleksi dan siapa cepat dia dapat), minimal 20 pendaftar dummy.
- Dokumentasi API (OpenAPI + Scalar) dan petunjuk instalasi, deployment, pengujian.

**Nice-to-have (kalau waktu cukup)**

- Template email yang bisa diedit admin dengan placeholder.
- Lampiran template dokumen per syarat (mis. format surat persetujuan desa).
- Status khusus "perlu perbaikan" (versi demo sudah bisa mengganti berkas yang ditandai INVALID, lihat 6.6).
- Pendaftar membatalkan pendaftarannya sendiri.
- Kuota per program di dalam satu event.
- Dokumen profil (KTP, pas foto) yang dipakai ulang antar event.

**Di luar lingkup**

- Antrean *waiting room* untuk trafik sangat besar.
- Pembayaran, form builder dinamis per event, aplikasi mobile, SSO.
- OAuth 2.0 untuk email (disiapkan strukturnya, lihat bagian 12).

## 3. Pengguna dan hak akses

Ada empat jenis pengguna: publik, pendaftar, operator, dan admin. Operator mengerjakan verifikasi; admin bisa semua yang operator bisa, ditambah pengaturan event, user, dan sistem. Akun pendaftar dan akun staff disimpan di tabel terpisah dan memakai sesi terpisah, tetapi halaman login hanya satu: isian yang memuat `@` diperiksa ke akun pendaftar, selain itu ke akun staff.

| Aksi | Publik | Pendaftar | Operator | Admin |
| --- | --- | --- | --- | --- |
| Lihat event yang dibuka dan detailnya | Ya | Ya | Ya | Ya |
| Daftar akun, verifikasi OTP, lupa password | Ya | — | — | — |
| Kelola profil sendiri | — | Ya | — | — |
| Daftar event, unggah dokumen, submit | — | Ya | — | — |
| Lihat status, riwayat, dan bukti pendaftaran sendiri | — | Ya | — | — |
| Dashboard dan daftar pendaftar | — | — | Ya | Ya |
| Detail pendaftar dengan NIK lengkap | — | — | Ya | Ya |
| Verifikasi dokumen, ubah status, isi catatan | — | — | Ya | Ya |
| Verifikasi akun pendaftar secara manual | — | — | Ya | Ya |
| Export CSV/Excel dan cetak laporan | — | — | Ya | Ya |
| Koreksi status final (dengan alasan wajib) | — | — | — | Ya |
| Kelola event, program, kuota, syarat dokumen | — | — | — | Ya |
| Kelola master jenis dokumen | — | — | — | Ya |
| Kelola staff user | — | — | — | Ya |
| Pengaturan email dan sistem | — | — | — | Ya |
| Lihat activity log global dan outbox email | — | — | — | Ya |

Hak akses dicek di backend lewat middleware per route. Menyembunyikan tombol di UI hanya untuk kenyamanan, bukan pengaman. Pendaftar yang membuka pendaftaran milik orang lain mendapat respons 404, bukan 403, supaya keberadaan data tidak bocor. Operator tetap melihat riwayat status dan log aktivitas untuk pendaftar yang sedang dibukanya (MP-03); log global hanya untuk admin.

## 4. Tech stack dan arsitektur

Satu bahasa dari ujung ke ujung: TypeScript di Bun untuk API dan Vue untuk frontend, dengan skema validasi Zod yang dipakai bersama. Redis tidak dipakai; PostgreSQL menangani sesi, OTP, dan antrean email.

&#91;embedded content: arsitektur sistem · 5 komponen\]

Browser hanya bicara ke API, kecuali untuk berkas: API menerbitkan presigned URL, browser mengunggah langsung ke RustFS, lalu API memeriksa isinya.

| Lapisan | Pilihan | Catatan |
| --- | --- | --- |
| Runtime | Bun 1.4+ | `Bun.password` (Argon2id), client S3 bawaan, `bun test` |
| Backend | Hono + `@hono/zod-openapi` | Validasi Zod sekaligus menghasilkan dokumentasi OpenAPI |
| Database | PostgreSQL + Drizzle ORM | Migration dan seed dari kode |
| Object storage | RustFS (S3-compatible) | `:latest` selama development, dibekukan ke tag versi H-1 presentasi |
| Cadangan storage | Disk lokal lewat `Bun.file` | Diaktifkan dengan `STORAGE_DRIVER=local` |
| Email | nodemailer → Gmail SMTP (App Password) | Mailpit untuk development |
| Frontend | Vue 3 + Vite + Pinia + Vue Router | SPA, dilayani oleh container API |
| Styling | Tailwind CSS | Palet dijadikan token tema; font Schibsted Grotesk |
| Grafik | Chart.js lewat vue-chartjs |  |
| Ikon | Font Awesome (free) | Sesuai spesifikasi |
| Export | exceljs (Excel), CSV stream | PDF lewat halaman cetak browser |
| Deploy | Docker Compose | nginx, api, postgres, rustfs, mailpit (profil dev) |

### Struktur repository

```
apps/
  api/         Hono, Drizzle schema, migration, seed, worker email
  web/         Vue 3 SPA
packages/
  shared/      Skema Zod, tipe, enum status, aturan transisi
docker-compose.yml
.env.example
```

`packages/shared` berisi kontrak antara FE dan BE. Aturan validasi (NIK 16 digit, ukuran file, format tanggal) dan daftar transisi status ditulis sekali di sana dan dipakai oleh keduanya.

### Struktur modul (modular monolith)

Backend adalah modular monolith: satu proses, satu database, satu deploy, tetapi dibagi per domain dengan batas yang ditegakkan lint. Setiap modul memiliki tabelnya sendiri dan hanya bisa dipakai lewat API publiknya, sehingga modul bisa diuji sendiri dan nanti dipisah tanpa menulis ulang logika.

```
apps/api/src/
  main.ts            entrypoint API
  worker.ts          entrypoint worker email + pembersihan unggahan (RUN_WORKER=true: satu proses untuk demo)
  modules/
    audit/  auth/  participants/  staff/  settings/
    events/  documents/  registrations/  review/
    notifications/  reports/
  shared/
    db/        client, helper transaksi, paginasi
    http/      format error, validator, helper route
    storage/   StorageDriver: s3 (RustFS) dan local
    mail/      transport nodemailer
    crypto/    AES-256-GCM, hash token
    events/    event bus internal bertipe
```

| Modul | Tanggung jawab | Tabel yang dimiliki |
| --- | --- | --- |
| `audit` | Mencatat activity log dari event modul lain; menyediakan `listForEntity` dan `listForRegistration` untuk dibaca | `activity_logs` |
| `settings` | Pengaturan aplikasi dan email, enkripsi nilai rahasia | `settings` |
| `notifications` | Outbox, worker, template email; data email datang dari payload event | `notifications` |
| `auth` | Sesi, login staff dan pendaftar, middleware requireStaff/requireAdmin/requireParticipant, OTP, rate limit | `sessions`, `email_otps` |
| `participants` | Akun dan profil pendaftar | `participants` |
| `staff` | Staff user dan role | `staff_users` |
| `events` | Event, program, master jenis dokumen, syarat dokumen, kunci kuota | `events`, `event_programs`, `document_types`, `event_document_requirements` |
| `documents` | Unggahan sementara, konfirmasi, penggantian, verifikasi berkas, pembersihan unggahan kedaluwarsa | `documents`, `uploads` |
| `registrations` | Draft, submit, nomor registrasi, status dan riwayatnya, penegakan tabel transisi | `registrations`, `registration_status_history` |
| `review` | Use case staff: mulai tinjau, terima, tolak, waiting list, koreksi, verifikasi dokumen; menggabungkan cek dokumen dan kuota | Tidak ada |
| `reports` | Dashboard, export, laporan | Tidak ada; hanya query baca |

Isi satu modul, contoh `registrations`:

```
modules/registrations/
  index.ts                    API publik: service + tipe yang boleh dipakai modul lain
  registrations.routes.ts     handler Hono + definisi OpenAPI
  registrations.service.ts    use case: createDraft, submit, listMine
  registrations.repository.ts query Drizzle, hanya ke tabel milik modul
  registrations.table.ts      definisi tabel Drizzle
  registrations.events.ts     event yang dipancarkan modul
  registrations.test.ts
```

**Aturan batas modul**

1. Sebuah tabel hanya ditulis oleh modul pemiliknya. Modul lain memanggil service-nya, mis. `review` memanggil `events.lockForQuota(tx, eventId)`, bukan meng-update tabel `events`.
2. Antar modul hanya lewat `index.ts`. Import ke file internal modul lain ditolak oleh lint (`eslint-plugin-boundaries`).
3. Dependensi satu arah, tidak boleh melingkar: `shared` → `audit`, `settings`, `notifications` → `auth`, `participants`, `staff` → `events` → `documents` → `registrations` → `review` → `reports`. Bila modul yang lebih awal di rantai butuh data dari modul sesudahnya, data itu dioper sebagai parameter. Contoh: `documents` menerima konteks pendaftaran (id, status, event) dari pemanggil, tidak memanggil `registrations`.
4. Penulisan ke `audit` dan `notifications` hanya lewat event: keduanya mendengarkan event yang didaftarkan di `main.ts`, dan payload event sudah membawa data yang dibutuhkan (nama, email, nomor, status, catatan, `registration_id`). Membaca boleh lewat service publik, mis. `audit.listForRegistration` dipakai `GET /admin/registrations/:id`.
5. Status pendaftaran hanya berubah lewat `registrations.changeStatus(tx, …)`, yang menegakkan tabel transisi dari `packages/shared` dan menulis `registration_status_history`. Submit memakainya untuk `DRAFT` → `SUBMITTED`; `review` memakainya untuk transisi staff setelah mengecek syarat lewat `documents` dan `events.lockForQuota`.
6. Transaksi lintas modul dibuka oleh use case pemanggil, lalu `tx` dioper ke setiap service. Urutan kunci selalu baris event dulu, baru baris pendaftaran (6.7). Submit = `events.lockForQuota` + kunci pendaftaran + `documents.assertRequiredUploaded` + nomor registrasi + `changeStatus`, semuanya dalam satu transaksi Postgres.
7. Efek samping lewat event internal bertipe: `participant.registered`, `otp.requested`, `registration.submitted`, `registration.status_changed`, `document.verified`, `document.replaced`, `report.exported`, `settings.changed`. Handler yang menulis outbox dan activity log berjalan di dalam transaksi yang sama, sehingga perubahan tidak pernah tersimpan tanpa email dan log-nya.
8. `reports` tidak menulis tabel apa pun: query baca lintas tabel untuk agregasi, dan export dicatat dengan memancarkan `report.exported`.

**Reuse kode**

- `packages/shared`: skema Zod, enum status, tabel transisi status, dan aturan validasi (NIK, ukuran dan jenis file) dipakai bersama oleh API dan Vue.
- Frontend memakai klien `fetch` tipis (`useApi`) dan skema dari `packages/shared`. Hono RPC tidak dipakai, karena route didaftarkan lewat satu helper yang menyatukan validasi, OpenAPI, dan format respons.
- Middleware, format error, paginasi, storage driver, mailer, dan helper kripto ditulis sekali di `apps/api/src/shared`.
- Frontend memakai struktur yang sama: `apps/web/src/features/<fitur>` (halaman, komponen, store, panggilan API), komponen UI bersama di `src/components/ui` (Button, DataTable, StatusBadge, FileUpload, Modal), dan composable seperti `usePagination` serta `useUrlFilters`.

**Jalur scale.** Langkah pertama bila beban naik: menjalankan `worker.ts` sebagai container terpisah, tanpa perubahan kode. Berikutnya: API dijalankan beberapa instance di belakang reverse proxy, dengan rate limit dipindah ke Valkey. Modul dengan batas jelas, mis. `notifications` atau `documents`, bisa dipisah menjadi service sendiri hanya bila memang ada kebutuhan nyata.

## 5. Model data

Inti modelnya: satu `participant` punya banyak `registrations`, satu `event` punya banyak `registrations`, dan pasangan peserta–event dibatasi unik. Semua primary key memakai UUID v7 (`Bun.randomUUIDv7()`, urut waktu); nomor registrasi yang dibaca manusia disimpan di kolom terpisah. Relasi selalu lewat ID, tidak pernah lewat nomor baris.

&#91;embedded content: ERD · 8 tabel inti, 6 tabel pendukung\]

Tidak digambar agar tetap terbaca: tabel uploads (unggahan sementara milik documents), `registrations.program_id` ke `event_programs`, `notifications` ke `participants` dan `registrations`, serta kolom `verified_by` / `changed_by` / `created_by` ke `staff_users`.

### Tabel inti

| Tabel | Kolom | Catatan |
| --- | --- | --- |
| `participants` | id, nik, full\_name, gender, birth\_place, birth\_date, email, phone, address, institution, education\_level, password\_hash, email\_verified\_at, status, created\_at, updated\_at | `nik` unik dan tidak bisa diubah; `email` unik tapi boleh diganti; status `ACTIVE` / `SUSPENDED` |
| `events` | id, name, slug, type, description, registration\_prefix, start\_at, end\_at, quota\_mode, quota, requires\_program, status, last\_seq, created\_by, created\_at, updated\_at | type `PMB` / `PELATIHAN` / `SEMINAR` / `KEGIATAN`; quota\_mode `FCFS` / `SELECTION`; quota kosong = tanpa batas; status `DRAFT` / `PUBLISHED` / `CLOSED`; `last_seq` = penghitung nomor registrasi |
| `event_programs` | id, event\_id, name, is\_active | Pilihan program per event, mis. prodi; opsional |
| `document_types` | id, name, description, created\_at | Master jenis dokumen: KTP, Ijazah, Pas Foto, Surat Persetujuan Desa, dll.; `name` unik |
| `event_document_requirements` | event\_id, document\_type\_id, is\_required, notes | PK gabungan; syarat dokumen per event, wajib atau opsional |
| `registrations` | id, registration\_number, participant\_id, event\_id, program\_id, status, submitted\_at, verification\_notes, verified\_by, verified\_at, created\_at, updated\_at | `UNIQUE(participant_id, event_id)`; `registration_number` unik, diisi saat submit |
| `registration_status_history` | id, registration\_id, from\_status, to\_status, notes, changed\_by, changed\_at | Riwayat status yang juga ditampilkan ke pendaftar |
| `documents` | id, registration\_id, document\_type\_id, object\_key, original\_name, mime\_type, size\_bytes, verification\_status, notes, uploaded\_at, replaced\_at, verified\_by, verified\_at | `UNIQUE(registration_id, document_type_id)`; baris dibuat saat konfirmasi pertama berhasil; verification\_status `PENDING` / `VALID` / `INVALID`; `replaced_at` terisi saat file diganti dan dikosongkan saat diverifikasi ulang |
| `uploads` | id, registration\_id, document\_type\_id, temp\_key, original\_name, status, expires\_at, received\_at, created\_at | Unggahan sementara; status `PENDING` / `CONFIRMED` / `REJECTED` / `EXPIRED`; satu baris per percobaan unggah |

### Tabel staff dan pendukung

| Tabel | Kolom | Catatan |
| --- | --- | --- |
| `staff_users` | id, username, full\_name, email, password\_hash, role, status, last\_login\_at, created\_at, updated\_at | `username` unik; role `ADMIN` / `OPERATOR`; status `ACTIVE` / `INACTIVE` |
| `sessions` | id, token\_hash, subject\_type, subject\_id, expires\_at, ip\_address, user\_agent, created\_at | subject\_type `STAFF` / `PARTICIPANT`; yang disimpan hanya hash token |
| `email_otps` | id, participant\_id, purpose, email, code\_hash, attempts, expires\_at, consumed\_at, created\_at | purpose `VERIFY_EMAIL` / `RESET_PASSWORD` / `CHANGE_EMAIL` |
| `notifications` | id, participant\_id, registration\_id, type, recipient, subject, body\_html, body\_text, status, attempts, last\_error, next\_attempt\_at, sent\_at, created\_at | Outbox email; status `PENDING` / `SENT` / `FAILED` |
| `activity_logs` | id, actor\_type, actor\_id, action, entity\_type, entity\_id, registration\_id, description, metadata, ip\_address, created\_at | `registration_id` terisi untuk semua aksi yang menyangkut satu pendaftaran (termasuk verifikasi dokumen), sehingga log per pendaftar cukup satu query; `metadata` JSONB tanpa password, OTP, atau rahasia SMTP |
| `settings` | key, value, is\_secret, updated\_by, updated\_at | Pengaturan email dan aplikasi; nilai rahasia dienkripsi |

Index tambahan: `registrations(event_id, status)`, `registrations(created_at)`, `participants(full_name)` untuk pencarian, `notifications(status, next_attempt_at)` untuk worker outbox, dan `activity_logs(entity_type, entity_id)`, activity\_logs(registration\_id), uploads(status, expires\_at).

## 6. Aturan bisnis

Setiap aturan di bawah ditegakkan di backend dan diuji otomatis. Kuota dan nomor registrasi diproses dalam satu transaksi yang mengunci baris event, jadi dua submit di detik yang sama tidak bisa melebihi kuota atau mendapat nomor yang sama.

### 6.1 Event dianggap buka

Event menerima pendaftaran bila status `PUBLISHED`, waktu server berada di antara `start_at` dan `end_at`, dan untuk mode `FCFS` masih ada slot. Waktu disimpan sebagai `timestamptz` dan ditampilkan dalam WIB. Admin bisa menutup event kapan saja dengan status `CLOSED`.

### 6.2 Mode kuota

|  | Siapa cepat dia dapat (`FCFS`) | Seleksi (`SELECTION`) |
| --- | --- | --- |
| Contoh | Seminar, pelatihan berkapasitas | PMB |
| Yang dibatasi kuota | Pendaftaran yang sudah submit | Pendaftar yang `ACCEPTED` |
| Slot terpakai dihitung dari | Semua status kecuali `DRAFT` dan `REJECTED` | Status `ACCEPTED` saja |
| Dicek saat | Submit | Admin menekan "Terima" |
| Kalau penuh | Submit ditolak "Kuota penuh", draft tetap tersimpan, event tampil penuh | Tombol Terima tidak bisa dipakai; pilihannya Waiting List atau Tolak |
| Status `WAITING_LIST` | Tidak dipakai | Dipakai |
| Penolakan | Mengembalikan satu slot; koreksi kembali ke UNDER\_REVIEW mengambilnya lagi dan ditolak bila penuh | Tidak memengaruhi kuota |

Pengecekan dilakukan dalam transaksi: `SELECT ... FROM events WHERE id = ? FOR UPDATE`, hitung slot terpakai, lalu simpan. Kuota tidak bisa diturunkan di bawah jumlah slot yang sudah terpakai.

### 6.3 Nomor registrasi

Format `{PREFIX}-{TAHUN}-{URUT 4 DIGIT}`, contoh `SEM-2026-0007`. Prefix diatur per event (2–5 huruf kapital, unik). Nomor diambil dari `events.last_seq` yang dinaikkan di transaksi submit yang sama, jadi draft tidak menghabiskan nomor dan nomor tidak pernah dipakai ulang.

### 6.4 Pencegahan duplikat

- Satu NIK hanya punya satu akun (`participants.nik` unik). NIK tidak bisa diubah setelah akun dibuat.
- Email unik di antara akun, tapi bukan identitas: pendaftar boleh menggantinya dengan verifikasi OTP ke email baru.
- Satu akun hanya punya satu pendaftaran per event (`UNIQUE(participant_id, event_id)`). Pindah program dilakukan admin, bukan dengan mendaftar ulang.
- Event berbeda tidak saling menghalangi: akun yang sama boleh ikut PMB lalu seminar beberapa bulan kemudian, atau dua event yang dibuka bersamaan.

### 6.5 Alur status

Status resmi sesuai spesifikasi dosen: `SUBMITTED`, `UNDER_REVIEW`, `ACCEPTED`, `REJECTED`, `WAITING_LIST`. Ditambah satu status internal `DRAFT` untuk pendaftaran yang belum dikirim; draft tidak terlihat di daftar admin dan tidak dihitung kuota.

&#91;embedded content: alur status · 6 status, 2 jalur koreksi\]

Garis putus-putus hanya bisa dipakai admin. Tabel di bawah merinci syarat setiap transisi.

| Dari | Ke | Oleh | Syarat |
| --- | --- | --- | --- |
| `DRAFT` | `SUBMITTED` | Pendaftar | Event buka, dokumen wajib lengkap, program terpilih bila diperlukan, kuota FCFS tersedia |
| `SUBMITTED` | `UNDER_REVIEW` | Operator/Admin | — |
| `UNDER_REVIEW` | `ACCEPTED` | Operator/Admin | Semua dokumen wajib `VALID`; mode seleksi: kuota diterima masih ada |
| `UNDER_REVIEW` | `REJECTED` | Operator/Admin | Catatan wajib diisi |
| `UNDER_REVIEW` | `WAITING_LIST` | Operator/Admin | Hanya mode seleksi; semua dokumen wajib `VALID` |
| `WAITING_LIST` | `ACCEPTED` | Operator/Admin | Semua dokumen wajib `VALID`; kuota diterima masih ada |
| `WAITING_LIST` | `REJECTED` | Operator/Admin | Catatan wajib diisi |
| `ACCEPTED` | `UNDER_REVIEW` | Admin | Koreksi kesalahan, alasan wajib |
| `REJECTED` | `UNDER_REVIEW` | Admin | Koreksi kesalahan, alasan wajib; mode FCFS: slot harus tersedia karena penolakan sudah mengembalikannya |

Semua pengecekan kuota, termasuk koreksi, memakai kunci baris event yang sama seperti 6.2.

Transisi lain ditolak backend dengan error `INVALID_TRANSITION`. UI hanya menampilkan tombol untuk transisi yang sah dari status saat ini. Setiap transisi menulis `registration_status_history`, `activity_logs`, dan satu email notifikasi ke outbox.

### 6.6 Dokumen

- Syarat dokumen diatur per event: centang jenis dari master, tandai wajib atau opsional. Jenis baru bisa ditambahkan langsung dari form event.
- Format yang diterima: PDF, DOC, DOCX, JPG, PNG. Ukuran maksimal 5 MB per file.
- Jenis file dicek dari isi (magic bytes), bukan dari ekstensi atau `Content-Type` kiriman browser. Magic bytes DOCX sama dengan ZIP, jadi DOCX juga harus memuat `[Content_Types].xml`.
- Satu file aktif per jenis dokumen per pendaftaran. File pengganti baru menggantikan yang lama setelah konfirmasinya lolos.
- Kapan file boleh diganti: semua file selama `DRAFT` atau `SUBMITTED`; saat `UNDER_REVIEW` atau `WAITING_LIST` hanya file `INVALID`; setelah `ACCEPTED` atau `REJECTED` tidak ada.
- File hanya bisa dihapus saat `DRAFT`. Setelah submit file hanya bisa diganti, supaya dokumen wajib tidak bisa hilang dan pendaftar tidak buntu.
- Setiap penggantian, apa pun status file sebelumnya, mengembalikan verifikasi ke `PENDING` dan mengisi `replaced_at`. `replaced_at` dikosongkan saat file diverifikasi ulang.
- Verifikasi file (`VALID` / `INVALID`) hanya boleh saat pendaftaran `UNDER_REVIEW` atau `WAITING_LIST`. Penandaan `INVALID` mengirim email ke pendaftar dengan catatannya.
- Bucket bersifat privat. File hanya dibuka lewat URL bertanda tangan berumur 5 menit untuk pemiliknya dan staff.
- Key final unik per unggahan dan tanpa data pribadi: `registrations/{registration_id}/{document_id}/{upload_id}.{ext}`. Key sementara: `uploads/{upload_id}`.

**Alur unggah.** Browser tidak pernah menulis ke key final; setiap unggahan masuk ke key sementara dan baru dipindahkan oleh API setelah lolos pemeriksaan. `useFileUpload()` di frontend tidak membedakan driver.

1. Browser meminta target unggah dan menerima `{ upload_id, method, url, headers }`. API mencatat baris `uploads` berstatus `PENDING`.
2. Browser mengirim `PUT` ke URL itu, yang selalu mengarah ke `uploads/{upload_id}`.
3. Browser mengonfirmasi `upload_id` ke API.
4. Di luar transaksi, API membaca objek sementara ke memori (berhenti bila lebih dari 5 MB), memeriksa ukuran dan magic bytes pada buffer itu, lalu menulis **buffer yang sama** ke key final dengan `Content-Type` dari hasil pemeriksaan. Pemeriksaan dan penulisan memakai byte yang sama, jadi tidak ada celah antara "diperiksa" dan "disimpan". Bila gagal: objek sementara dihapus, `uploads` menjadi `REJECTED`, dan berkas lama tetap utuh.
5. API membuka transaksi, mengunci baris pendaftaran, dan membaca ulang apakah file masih boleh diganti (6.7). Bila boleh: `documents.object_key` diarahkan ke key baru, `uploads` menjadi `CONFIRMED`, lalu commit. Bila tidak: key final yang baru ditulis dihapus dan unggahan ditolak.
6. Setelah commit, objek lama dan objek sementara dihapus. Kunci baris tidak pernah ditahan selama transfer berkas.

Presigned URL tidak bisa dicabut, tapi setelah konfirmasi URL itu hanya bisa menulis ke key sementara yang sudah tidak dipakai. Unggahan yang tidak dikonfirmasi dalam 1 jam ditandai `EXPIRED`. Worker juga menyapu semua objek di prefix `uploads/` yang berumur lebih dari 1 jam, termasuk objek yang muncul karena PUT ulang setelah konfirmasi.

| Driver | Unggah ke key sementara | Unduh |
| --- | --- | --- |
| `s3` (RustFS) | Presigned PUT ke `uploads/{upload_id}` | Presigned GET ke key final |
| `local` (disk) | `PUT /api/v1/uploads/:token`; body di-stream dan dihentikan saat melewati 5 MB | `GET /api/v1/files/:token` |

Token driver lokal ditandatangani HMAC dengan `APP_KEY`, berlaku 5 menit, terikat ke satu `upload_id`, dan sekali pakai: API mengisi `uploads.received_at` pada PUT pertama dan menolak PUT berikutnya untuk upload yang sama.

**Alamat S3 internal dan publik.** Tanda tangan presigned URL mengikat host, padahal API (di jaringan Docker) dan browser mengakses RustFS lewat alamat berbeda. Karena itu ada dua variabel:

- `S3_ENDPOINT`: alamat internal, mis. `http://rustfs:9000`, dipakai API untuk HEAD, GET, PUT ke key final, dan DELETE.
- `S3_PUBLIC_ENDPOINT`: alamat yang dilihat browser, dipakai hanya untuk menandatangani URL.

Konfigurasi yang dipakai: `S3_PUBLIC_ENDPOINT` = `APP_URL` dengan path-style, dan Nginx meneruskan `location /<bucket>/` ke RustFS. Browser mengunggah ke origin yang sama, jadi CORS bucket tidak diperlukan dan port RustFS tidak dibuka. Aplikasi harus dibuka persis di alamat `APP_URL`; dibuka lewat alamat lain (IP berbeda, `localhost`, port lain), origin dan tanda tangan tidak cocok dan unggahan gagal.

**Konfigurasi Nginx wajib**

- `client_max_body_size 6m` untuk `/<bucket>/` dan `/api/v1/uploads/`. Bawaan Nginx 1 MB akan menolak file 2 MB dengan 413; 6 MB membuat file 6 MB tetap sampai ke pesan error aplikasi.
- `proxy_set_header Host $http_host`, bukan `$host`, karena `$host` membuang nomor port dan tanda tangan gagal bila aplikasi berjalan di port selain 80.
- `add_header X-Content-Type-Options nosniff` di `location /<bucket>/`, karena berkas satu origin dengan aplikasi dan `secureHeaders` Hono tidak berlaku di jalur ini.
- `proxy_set_header X-Real-IP $remote_addr` ke API. API membaca IP klien hanya dari header ini (port API tidak dibuka, jadi header tidak bisa dipalsukan dari luar Nginx). IP ini dipakai rate limit dan `activity_logs.ip_address`.

**Rencana cadangan.** Tanda tangan presigned URL lewat Nginx diuji di tahap Fondasi. Bila RustFS menolaknya, pilih salah satu tanpa mengubah kode aplikasi: (a) bucket dibuka di host atau port terpisah, `S3_PUBLIC_ENDPOINT` diarahkan ke sana, dan CORS bucket diatur (origin `APP_URL`, metode `PUT` dan `GET`, header `Content-Type`); atau (b) demo memakai `STORAGE_DRIVER=local`.

### 6.7 Konkurensi per pendaftaran

Selain kunci baris event untuk kuota (6.2), setiap aksi yang mengubah satu pendaftaran mengunci baris `registrations`-nya dengan `SELECT ... FOR UPDATE`, lalu membaca ulang status dan dokumennya sebelum memutuskan. Ini berlaku untuk submit, `changeStatus`, verifikasi dokumen, dan konfirmasi unggahan.

- Urutan kunci selalu baris event dulu, baru baris pendaftaran, supaya tidak terjadi deadlock. Aksi yang tidak menyentuh kuota cukup mengunci baris pendaftaran.
- Dua staff menerima dan menolak bersamaan: yang kedua membaca status yang sudah berubah dan ditolak `INVALID_TRANSITION`.
- Staff menerima tepat saat dokumen ditandai `INVALID` atau diganti pendaftar: aksi berjalan bergiliran, dan Terima membaca ulang dokumen, sehingga ditolak bila ada dokumen wajib yang tidak lagi `VALID`.

## 7. Kebutuhan fungsional

Kebutuhan dikelompokkan per modul. Setiap ID dipakai lagi di checklist pengujian (bagian 12), jadi satu baris = satu hal yang bisa didemokan dan dicentang.

### Akun pendaftar (AK)

| ID | Kebutuhan | Kriteria penerimaan |
| --- | --- | --- |
| AK-01 | Daftar akun | Isian NIK, nama, email, no. HP, password, data profil. NIK 16 digit angka. NIK atau email yang sudah dipakai ditolak dengan pesan jelas. Password minimal 8 karakter. Akun dibuat belum terverifikasi dan OTP dikirim. |
| AK-02 | Verifikasi email dengan OTP | Kode 6 digit, berlaku 10 menit, maksimal 5 percobaan. Kirim ulang paling cepat 60 detik sekali. Berhasil → `email_verified_at` terisi dan pendaftar langsung masuk. |
| AK-03 | Login | Satu halaman untuk semua akun: email (pendaftar) atau username (staff) + password. Sistem memilah jenis akun dan mengarahkan ke `/me` atau `/admin`. Pesan gagal sama untuk semua akun. Akun belum terverifikasi diarahkan ke halaman OTP. 5 kali gagal dalam 15 menit → diblok sementara. |
| AK-04 | Lupa password | OTP reset dikirim ke email. Setelah password diganti, semua sesi lama dicabut. |
| AK-05 | Kelola profil | Semua data profil bisa diubah kecuali NIK. Ganti email → OTP ke email baru; email lama tetap berlaku sampai verifikasi selesai. Ganti password memerlukan password lama. |

### Pendaftaran event (PE)

| ID | Kebutuhan | Kriteria penerimaan |
| --- | --- | --- |
| PE-01 | Landing dan daftar event | Tanpa login. Menampilkan event `PUBLISHED`: jenis, jadwal, status buka/tutup, sisa kuota (FCFS) atau label "Seleksi". |
| PE-02 | Detail event | Deskripsi, jadwal, pilihan program, daftar syarat dokumen dengan tanda wajib/opsional. |
| PE-03 | Mulai mendaftar | Hanya akun terverifikasi dan event yang buka. Sudah punya pendaftaran di event itu → diarahkan ke pendaftaran yang ada. Membuat pendaftaran `DRAFT`. |
| PE-04 | Unggah dan ganti dokumen | Per jenis dokumen, sesuai aturan 6.6. Progres unggah terlihat. Semua file bisa diganti selama `DRAFT`/`SUBMITTED`; setelah itu hanya file yang ditandai `INVALID`. File salah format atau lebih dari 5 MB ditolak dengan pesan jelas. |
| PE-05 | Submit | Dokumen wajib lengkap dan program terpilih bila diperlukan. Periode dan kuota dicek di server dalam transaksi. Berhasil → nomor registrasi, status `SUBMITTED`, email bukti masuk outbox. Kuota penuh → pesan jelas, draft tetap ada. |
| PE-06 | Bukti pendaftaran | Nomor registrasi, event, program, data ringkas pendaftar, daftar dokumen, waktu submit. Bisa dicetak atau disimpan PDF dari browser. |
| PE-07 | Pendaftaran saya (cek status) | Semua pendaftaran milik akun, indikator tahapan (lengkapi berkas, terkirim, ditinjau, hasil) dengan waktu dan kalimat langkah berikutnya, status terkini, riwayat status dengan waktu, catatan verifikasi, dan dokumen yang perlu diganti beserta catatannya. |

### Dashboard admin (DA)

| ID | Kebutuhan | Kriteria penerimaan |
| --- | --- | --- |
| DA-01 | Ringkasan | Total pendaftar dan jumlah per status, bisa difilter per event. Angka sama dengan hasil query di daftar pendaftar. |
| DA-02 | Grafik | Pendaftaran per hari (30 hari terakhir) dan per bulan; jumlah per status. |
| DA-03 | Kuota | Slot terpakai dibanding kuota untuk setiap event yang sedang buka. |
| DA-04 | Antrean dan aktivitas | Antrean verifikasi dari yang terlama menunggu, pendaftaran terbaru, program terbanyak, dan kalender tenggat event. Tanpa NIK dan email. Admin melihat jumlah email gagal terkirim; operator tidak. |

### Manajemen pendaftar (MP)

| ID | Kebutuhan | Kriteria penerimaan |
| --- | --- | --- |
| MP-01 | Daftar pendaftar | Paginasi di server, 20 baris per halaman. Kolom: nomor, nama, NIK tersamar (`3527********0001`), event, program, status, tanggal submit, penanda "berkas diperbarui" (ada dokumen dengan `replaced_at` terisi). |
| MP-02 | Cari dan filter | Cari nama, nomor registrasi, NIK, email. Filter event, status, program, rentang tanggal. Filter tersimpan di URL sehingga bisa dibagikan dan bertahan saat refresh. |
| MP-03 | Detail pendaftar | Profil lengkap dengan NIK utuh, dokumen dengan urutan tetap menurut nama, pratinjau dokumen (gambar dan PDF) dan unduh, riwayat status, dan log aktivitas khusus pendaftar itu (termasuk verifikasi dokumen). Operator dan admin sama-sama melihatnya. |
| MP-04 | Verifikasi dokumen | Hanya saat `UNDER_REVIEW` atau `WAITING_LIST`. Setiap file ditandai `VALID` atau `INVALID` dengan catatan. `INVALID` mengirim email ke pendaftar agar mengganti berkas; file pengganti kembali `PENDING` dengan penanda "diperbarui". |
| MP-05 | Ubah status | Hanya transisi sah (6.5) yang tampil sebagai tombol; tombol yang syaratnya belum terpenuhi (dokumen belum `VALID`, kuota penuh) tampil nonaktif dengan alasannya. Catatan wajib untuk penolakan. Bila data berubah sejak halaman dibuka, aksi ditolak dengan pesan untuk memuat ulang (6.7). |
| MP-06 | Jejak perubahan | Setiap perubahan status menulis riwayat, activity log, dan email notifikasi ke outbox. |

### Manajemen event (EV) — admin

| ID | Kebutuhan | Kriteria penerimaan |
| --- | --- | --- |
| EV-01 | CRUD event | Nama, jenis, deskripsi, prefix, periode, mode kuota, kuota, status. `end_at` harus setelah `start_at`. |
| EV-02 | Program event | Tambah, ubah, nonaktifkan. Program yang sudah dipilih pendaftar tidak bisa dihapus. |
| EV-03 | Syarat dokumen | Centang jenis dari master, tandai wajib/opsional, tambah jenis baru langsung dari form. |
| EV-04 | Penguncian | Prefix, mode kuota, dan syarat dokumen terkunci setelah ada pendaftaran yang submit. Kuota tidak bisa diturunkan di bawah slot terpakai. |

### Laporan (LP)

| ID | Kebutuhan | Kriteria penerimaan |
| --- | --- | --- |
| LP-01 | Export CSV dan Excel | Mengikuti filter yang sedang aktif. Berisi NIK lengkap, karena itu hanya untuk staff dan setiap export tercatat di activity log. |
| LP-02 | Laporan cetak | Rekap per event (per status, per program, per hari) dan daftar pendaftar. Tata letak cetak rapi di A4; disimpan PDF lewat dialog cetak browser. |

### Staff dan sistem (SS)

| ID | Kebutuhan | Kriteria penerimaan |
| --- | --- | --- |
| SS-01 | Kelola staff | Admin membuat, mengubah, menonaktifkan staff dan me-reset password. Admin tidak bisa menonaktifkan dirinya sendiri atau admin aktif terakhir. |
| SS-02 | Verifikasi akun manual | Operator/admin menandai email pendaftar terverifikasi bila OTP tidak sampai; tercatat di log. |
| SS-03 | Activity log | Filter per aktor, aksi, entitas, tanggal. |
| SS-04 | Pengaturan email dan aplikasi | Lihat bagian 10. |

## 8. API

REST API di bawah `/api/v1`, JSON masuk dan keluar, divalidasi Zod, dan didokumentasikan otomatis di `/docs` (Scalar). Respons sukses berbentuk `{ "data": ... }`; error berbentuk `{ "error": { "code", "message", "fields"? } }` dengan kode seperti `VALIDATION_ERROR`, `QUOTA_FULL`, `DUPLICATE_NIK`, `INVALID_TRANSITION`.

### Publik dan akun pendaftar

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/events` | Event yang `PUBLISHED`, dengan status buka dan sisa kuota |
| GET | `/events/:slug` | Detail event, program, syarat dokumen |
| POST | `/auth/register` | Daftar akun, kirim OTP |
| POST | `/auth/verify-email` | Cek OTP, aktifkan akun, buat sesi |
| POST | `/auth/resend-otp` | Kirim ulang OTP (dibatasi) |
| POST | `/auth/login` | Satu pintu login. Body `{ identifier, password }`; respons memuat `type` `PARTICIPANT` atau `STAFF` |
| POST | `/auth/logout` | Akhiri sesi pendaftar |
| POST | `/auth/forgot-password` · `/auth/reset-password` | Reset password dengan OTP |
| GET · PATCH | `/me` | Profil sendiri |
| POST | `/me/change-email` · `/me/change-email/verify` | Ganti email dengan OTP |
| POST | `/me/change-password` | Ganti password |

### Pendaftaran milik pendaftar

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/me/registrations` | Semua pendaftaran milik akun (cek status) |
| POST | `/events/:id/registrations` | Buat draft |
| GET · PATCH | `/me/registrations/:id` | Detail; pilih program selama draft |
| POST | `/me/registrations/:id/uploads` | Buat upload\_id dan target unggah ke key sementara (presigned PUT atau URL lokal) |
| POST | `/me/registrations/:id/uploads/:uploadId/confirm` | Periksa buffer, tulis ke key final, ganti object\_key (6.6) |
| DELETE | `/me/registrations/:id/documents/:docId` | Hapus file, hanya saat `DRAFT`; setelah itu file hanya bisa diganti |
| GET | `/me/registrations/:id/documents/:docId/url` | URL unduh bertanda tangan, 5 menit |
| POST | `/me/registrations/:id/submit` | Submit: cek kuota, ambil nomor, kirim bukti |

Khusus `STORAGE_DRIVER=local`: `PUT /uploads/:token` dan `GET /files/:token` menggantikan presigned URL (token HMAC sekali pakai, 5 menit, satu upload\_id; lihat 6.6).

### Staff (`/admin`)

| Method | Path | Akses | Keterangan |
| --- | --- | --- | --- |
| POST | `/admin/auth/logout` | Staff | Akhiri sesi staff; login lewat `/auth/login` |
| GET | `/admin/dashboard/stats` | Staff | Ringkasan, grafik, kuota; filter `event_id` |
| GET | `/admin/registrations` | Staff | Daftar dengan `q`, `event_id`, `status`, `program_id`, `from`, `to`, `page` |
| GET | `/admin/registrations/:id` | Staff | Detail lengkap, riwayat status, dan log pendaftar dari `audit.listForRegistration` |
| POST | `/admin/registrations/:id/transitions` | Staff | Body `{ to, notes }`; aturan 6.5 dan 6.7 |
| PATCH | `/admin/documents/:id/verification` | Staff | Body `{ status, notes }`; hanya saat pendaftaran `UNDER_REVIEW` / `WAITING_LIST` |
| GET | `/admin/documents/:id/url` | Staff | URL unduh bertanda tangan untuk pratinjau |
| GET | `/admin/registrations/export` | Staff | `format=csv\|xlsx` + filter yang sama; memancarkan `report.exported` |
| GET | `/admin/reports/summary` | Staff | Data laporan cetak per event |
| GET | `/admin/participants` | Staff | Cari akun pendaftar |
| POST | `/admin/participants/:id/verify` | Staff | Verifikasi akun manual |
| GET · POST · PATCH | `/admin/events`, `/admin/events/:id` | Admin | Kelola event |
| GET · POST · PATCH | `/admin/events/:id/programs` | Admin | Kelola program |
| DELETE | `/admin/events/:id/programs/:programId` | Admin | Hapus program yang belum dipilih pendaftar (EV-02) |
| PATCH | `/admin/registrations/:id/program` | Admin | Pindah program (6.4) |
| GET | `/admin/event-options` | Staff | Pilihan event dan program untuk filter, juga untuk operator |
| GET | `/admin/auth/me` | Staff | Staff yang sedang masuk |
| PUT | `/admin/events/:id/document-requirements` | Admin | Ganti daftar syarat dokumen |
| GET · POST · PATCH | `/admin/document-types` | Admin | Master jenis dokumen |
| GET · POST · PATCH | `/admin/staff` | Admin | Kelola staff; `POST /admin/staff/:id/reset-password` |
| GET | `/admin/activity-logs` | Admin | Log global dengan filter |
| GET · PUT | `/admin/settings/email` · `/admin/settings/app` | Admin | Pengaturan |
| POST | `/admin/settings/email/test` | Admin | Kirim email uji |
| GET · POST | `/admin/notifications`, `/admin/notifications/:id/retry` | Admin | Pantau outbox, kirim ulang yang gagal |

`GET /health` memeriksa koneksi database dan storage.

### Pemetaan fungsi Apps Script di spesifikasi

| Fungsi di spesifikasi | Padanan |
| --- | --- |
| `doGet()` | Container API melayani SPA Vue |
| `initializeDatabase()` | `bun run db:migrate` + `bun run db:seed` |
| `getDashboardStats()` | `GET /admin/dashboard/stats` |
| `submitRegistration(data, files)` | Unggah per dokumen + `POST /me/registrations/:id/submit` |
| `generateRegistrationNumber()` | Fungsi service di dalam transaksi submit |
| `getRegistrationStatus(nomor, token)` | `GET /me/registrations` setelah login |
| `getRegistrants(filters)` | `GET /admin/registrations` |
| `getRegistrantDetail(id)` | `GET /admin/registrations/:id` |
| `updateRegistrationStatus(id, status, notes)` | `POST /admin/registrations/:id/transitions` |
| `uploadDocument(fileData)` | `uploads` + `confirm` |
| `sendRegistrationEmail()` | Worker outbox |
| `exportRegistrationData()` | `GET /admin/registrations/export` |
| `createActivityLog()` | Handler modul audit yang mendengarkan event; dibaca lewat audit.listForRegistration |

## 9. Halaman frontend

SPA Vue dengan dua area: publik/pendaftar yang dioptimalkan untuk HP (lebar minimal 360 px), dan admin yang dioptimalkan untuk desktop. Kesembilan halaman di spesifikasi dosen tercakup; kolom terakhir menunjukkan padanannya.

### Publik dan pendaftar

| Halaman | Route | Isi | Halaman dosen |
| --- | --- | --- | --- |
| Landing | `/` | Ringkasan, event yang dibuka, cara mendaftar | Landing Page |
| Detail event | `/events/:slug` | Jadwal, kuota, program, syarat dokumen, tombol daftar | — |
| Daftar akun | `/register` | Form akun + profil | — |
| Verifikasi OTP | `/verify` | Input 6 digit, kirim ulang dengan hitung mundur | — |
| Login, lupa password | `/login`, `/forgot-password` | Login: kartu dua panel tanpa header, panel hijau berisi judul dan event yang sedang dibuka di kiri, form di kanan; panel kiri disembunyikan di HP | — |
| Pendaftaran saya | `/me` | Kartu per pendaftaran: indikator tahapan, status, riwayat, catatan; di bawahnya event yang masih buka dan belum didaftari | Cek Status |
| Form pendaftaran | `/me/registrations/:id` | Saat draft: wizard pilih program → unggah dokumen → tinjau → submit. Setelah submit: indikator tahapan dan daftar dokumen | Formulir Pendaftaran |
| Bukti pendaftaran | `/me/registrations/:id/receipt` | Layout siap cetak | — |
| Profil | `/me/profile` | Ubah profil, email, password | — |

### Admin

| Halaman | Route | Isi | Halaman dosen |
| --- | --- | --- | --- |
| Login staff | `/login`, sama dengan pendaftar; `/admin/login` dialihkan ke sana | Email atau username + password; sistem memilah jenis akun | Login Admin |
| Dashboard | `/admin` | Banner sambutan, kartu ringkasan, grafik harian dan bulanan, antrean verifikasi, event yang buka dengan kuota, kalender tenggat, jumlah per status, program terbanyak, pendaftaran terbaru | Dashboard Admin |
| Pendaftar | `/admin/registrations` | Tabel, cari, filter, export | Manajemen Pendaftar |
| Detail pendaftar | `/admin/registrations/:id` | Profil, dokumen + pratinjau, verifikasi, tombol status, riwayat | Detail Pendaftar |
| Event | `/admin/events`, `/admin/events/:id` | Daftar dan form event, program, syarat dokumen | Pengaturan Pendaftaran |
| Jenis dokumen | `/admin/document-types` | Master jenis dokumen | Pengaturan Pendaftaran |
| Laporan | `/admin/reports` | Pilih event, rekap, cetak | Laporan Pendaftaran |
| Akun pendaftar | `/admin/participants` | Cari akun, verifikasi manual | — |
| Staff | `/admin/staff` | Kelola staff | — |
| Activity log, outbox | `/admin/activity-logs`, `/admin/notifications` | Pemantauan | — |
| Pengaturan | `/admin/settings` | Email dan aplikasi | Pengaturan Pendaftaran |

### Desain

- Palet menggantikan palet spesifikasi dosen, dijadikan token Tailwind di `apps/web/src/styles.css`: `ink #171A15` (sidebar, teks), `lime #B5F01E` (tombol utama, teks gelap di atasnya), `primary #2F7A0A` (tautan), `primary-light #E8F7C2` (latar sorotan), `forest #0B4F1E` dan `teal #0E5A6B` (aksen), `chart #4E9A0C` (grafik), `white #FFFFFF` (kartu), `background #EFF0EA` (latar halaman). Lime tidak dipakai sebagai warna teks karena kontrasnya tidak cukup.
- Gaya: tombol berbentuk pill, kartu bersudut besar, sidebar admin gelap yang mengapung. Landing memakai kartu gradien dan lingkaran konsentris; isinya diambil dari event sungguhan.
- Badge status memakai warna tetap: Submitted biru, Under Review kuning, Accepted hijau, Rejected merah, Waiting List ungu, Draft abu-abu.
- Setiap halaman data punya keadaan memuat, kosong, dan error. Aksi yang mengubah data menampilkan konfirmasi dan notifikasi hasil.
- Teks antarmuka berbahasa Indonesia, tanggal dalam format `31 Okt 2026, 14.05 WIB`.

### Struktur komponen frontend

Komponen dibuat sekali lalu dipanggil di semua halaman. Tampilan seluruhnya milik sendiri (Tailwind + token palet); hanya *perilaku* komponen interaktif yang sulit (fokus, keyboard, ARIA, posisi popup) yang memakai primitive headless Reka UI, tanpa gaya bawaan. Saat ini Reka UI dipakai untuk Dialog dan Toast; Select memakai elemen bawaan browser karena lebih nyaman di HP, dan komponen lain dibuat bila ada halaman yang membutuhkannya.

```
apps/web/src/
  components/
    ui/        Button, Input, Textarea, Badge, Card, Spinner        (buat sendiri)
               Dialog, Select, Combobox, DropdownMenu, Tabs,
               Tooltip, Toast                                       (Reka UI + gaya sendiri)
    form/      FormField, NikInput, DateInput, FileUpload
    data/      DataTable, Pagination, StatusBadge, StatCard, EmptyState
  layouts/     PublicLayout (publik dan pendaftar, menu atas), AdminLayout (sidebar)
  composables/ useApi, useAuth, usePagination, useUrlFilters,
               useConfirm, useToast, useFileUpload
  utils/       formatTanggalWIB, maskNik, formatBytes
  features/    auth/, events/, registrations/, review/, reports/, staff/, settings/
```

| Jenis komponen | Contoh | Cara membuat |
| --- | --- | --- |
| Visual sederhana | Button, Badge, Card, Input, StatCard, EmptyState | Ditulis sendiri; varian lewat props (`variant`, `size`, `loading`) |
| Interaktif kompleks | Dialog, Select, Combobox, DropdownMenu, Tabs, Tooltip, Toast | Primitive headless Reka UI, seluruh gaya ditulis sendiri |
| Komponen domain | DataTable (paginasi server), FileUpload, StatusBadge, NikInput | Ditulis sendiri di atas dua lapisan di atas |

Aturan:

- Halaman di `features/` hanya menyusun komponen dan composable; tidak ada gaya tombol atau warna status yang ditulis ulang di halaman.
- Logika yang dipakai ulang ditulis sebagai composable, mis. `useFileUpload()` membungkus alur presigned → unggah → konfirmasi. Class hanya untuk hal kecil seperti `ApiError`.
- Komponen dasar dibuat lebih dulu; komponen yang lebih spesifik baru diekstrak setelah polanya muncul di dua tempat.

## 10. Notifikasi email dan pengaturan sistem

Semua email lewat outbox: aksi bisnis menulis baris `notifications`, lalu worker yang mengirimkannya. Jadi pendaftaran tetap berhasil walau SMTP sedang gagal, dan setiap pengiriman tercatat sesuai permintaan spesifikasi. Pengaturan SMTP diubah dari panel admin, sehingga pengirim bisa pindah dari Gmail ke domain sendiri tanpa mengubah kode.

### Jenis email

| Pemicu | Penerima | Isi |
| --- | --- | --- |
| Daftar akun, kirim ulang OTP | Pendaftar | Kode OTP verifikasi, masa berlaku 10 menit |
| Lupa password | Pendaftar | Kode OTP reset password |
| Ganti email | Email baru | Kode OTP konfirmasi |
| Submit berhasil | Pendaftar | Bukti pendaftaran: nomor registrasi, event, program, waktu submit |
| Dokumen ditandai `INVALID` | Pendaftar | Nama dokumen, catatan staff, ajakan mengganti berkas |
| Status berubah | Pendaftar | Status baru, catatan verifikasi bila ada |
| Uji pengaturan | Admin | Email uji dari halaman pengaturan |

Email berisi nomor registrasi dan langkah cek status secara tertulis. Tautan tetap disertakan, tapi tidak menjadi satu-satunya cara, karena saat demo server berada di jaringan lokal.

### Worker outbox

- Worker punya entrypoint sendiri (`worker.ts`). Untuk demo, `RUN_WORKER=true` menjalankannya di dalam proses API; saat beban naik, worker dijalankan sebagai container terpisah tanpa ubah kode.
- Worker mengambil baris `PENDING` yang jatuh tempo setiap 5 detik dengan `FOR UPDATE SKIP LOCKED`, jadi aman walau worker berjalan lebih dari satu. Email OTP langsung memicu pengiriman tanpa menunggu interval bila worker berjalan di proses yang sama.
- Gagal kirim dicoba ulang 3 kali dengan jeda 1, 5, dan 15 menit. Setelah itu status `FAILED` dengan pesan error tersimpan; admin bisa mengirim ulang dari halaman outbox.
- Template untuk versi presentasi ditulis di kode, dalam versi HTML dan teks biasa.

### Pengaturan email (panel admin)

| Field | Contoh |
| --- | --- |
| Preset | Gmail / Domain sendiri / Custom — preset mengisi host dan port |
| Host, port, keamanan | `smtp.gmail.com`, `587`, STARTTLS |
| Jenis autentikasi | App Password (sekarang); OAuth 2.0 disiapkan untuk nanti |
| Username, password | Password disimpan terenkripsi |
| Nama dan alamat pengirim | "Panitia Pendaftaran" `<pendaftaran.xxx@gmail.com>` |
| Reply-To | Opsional |

- Tombol **Kirim email uji** ke alamat admin sebelum menyimpan.
- Password SMTP dienkripsi AES-256-GCM dengan `APP_KEY` dari `.env`, tidak di-hash, karena perlu dibaca ulang untuk login SMTP. Password tidak pernah dikirim ke frontend: form menampilkan `••••`, dan field kosong berarti password lama tetap dipakai.
- Bila pengaturan di database belum diisi, sistem memakai `SMTP_*` dari `.env`, jadi email sudah bisa dikirim sejak instalasi pertama.
- Setiap perubahan pengaturan tercatat di activity log, tanpa nilai password.

**Syarat agar tidak masuk spam.** Alamat pengirim harus sama dengan akun SMTP yang dipakai login. Dengan Gmail, SPF/DKIM/DMARC otomatis lolos untuk alamat `@gmail.com`. Saat pindah ke domain sendiri, record SPF, DKIM, dan DMARC domain itu harus dipasang dulu sesuai nilai dari penyedia email.

### Pengaturan aplikasi

| Field | Kegunaan |
| --- | --- |
| Nama aplikasi | Judul di UI dan email |
| Base URL | Dasar tautan di email; bila kosong mengikuti APP\_URL. Tidak memengaruhi tanda tangan S3, yang selalu memakai S3\_PUBLIC\_ENDPOINT. Contoh: `http://192.168.x.x` saat lokal, `https://daftar.domain.id` saat hosting |
| Email kontak panitia | Ditampilkan di landing dan footer email |

## 11. Keamanan dan kebutuhan non-fungsional

Aplikasi menyimpan NIK dan dokumen identitas, jadi pengamanan data pribadi diperlakukan sebagai kebutuhan, bukan tambahan. Prinsipnya mengikuti semangat UU 27/2022 tentang Pelindungan Data Pribadi: akses seminimal mungkin dan setiap akses sensitif tercatat.

### Keamanan

| Area | Ketentuan |
| --- | --- |
| Password | Argon2id lewat `Bun.password` |
| Sesi | Token acak 32 byte di cookie `httpOnly`, `SameSite=Lax`, `Secure` saat HTTPS; database hanya menyimpan hash SHA-256. Masa berlaku 7 hari untuk pendaftar, 12 jam untuk staff. Cookie staff dan pendaftar terpisah. |
| CSRF | `SameSite` + pengecekan header `Origin` pada setiap request yang mengubah data |
| Rate limit | Login 5 percobaan/15 menit per akun+IP; kirim OTP 1/60 detik dan 5/jam per akun; submit 5/menit per akun. IP klien diambil dari X-Real-IP yang diset Nginx (6.6). Token bucket in-memory (satu instance). |
| Otorisasi | Middleware role per route; cek kepemilikan untuk setiap resource milik pendaftar |
| Validasi input | Zod di setiap endpoint; query lewat Drizzle (terparameter) |
| File | Bucket privat, presigned URL 5 menit, cek magic bytes, maks 5 MB, key tanpa data pribadi, DOC/DOCX diunduh sebagai attachment |
| Data pribadi | NIK tersamar di daftar; utuh hanya di detail dan export; setiap export tercatat |
| Rahasia | `APP_KEY`, kredensial DB dan S3 di `.env`; password SMTP terenkripsi; log tidak pernah memuat password, OTP, atau token |
| Header | `secureHeaders` Hono; CORS hanya untuk origin aplikasi |
| Storage | RustFS tidak membuka port ke jaringan; browser mengakses bucket lewat Nginx di origin aplikasi (6.6); console 9001 hanya lewat SSH tunnel |

### Non-fungsional

| Aspek | Target |
| --- | --- |
| Konsistensi | 50 submit paralel ke event FCFS berkuota 10 menghasilkan tepat 10 pendaftaran dan 10 nomor unik |
| Kinerja | Daftar pendaftar dengan filter < 500 ms pada 10.000 data |
| Responsif | Halaman pendaftar nyaman di layar 360 px |
| Waktu | Disimpan `timestamptz`, ditampilkan WIB (`Asia/Jakarta`) |
| Pemantauan | Log JSON terstruktur; `/health` memeriksa database dan storage |
| Kode | TypeScript strict di semua package |

## 12. Tahapan, deployment, pengujian

Backend dikerjakan lebih dulu sampai seluruh alur bisa diuji lewat `/docs`, lalu frontend langsung memakai API asli tanpa mock. Urutan ini menjamin yang jadi lebih dulu adalah fitur yang benar-benar berfungsi.

### Tahapan pengerjaan

1. **Fondasi.** Monorepo, Docker Compose (nginx, postgres, rustfs, mailpit), konfigurasi Nginx (batas body 6 MB, Host, X-Real-IP), uji presigned PUT/GET lewat Nginx dengan S3\_PUBLIC\_ENDPOINT; bila gagal, langsung ambil rencana cadangan di 6.6, schema Drizzle, migration, seed: 1 admin, 1 operator, 2 event (seleksi dan FCFS), 6 jenis dokumen, minimal 20 pendaftar dummy dengan status beragam.
2. **Auth.** Login staff, daftar akun + OTP + login + reset pendaftar, middleware sesi dan role.
3. **Event.** CRUD event, program, master jenis dokumen, syarat dokumen.
4. **Pendaftaran.** Draft, unggah presigned + konfirmasi, submit dengan kunci kuota dan nomor registrasi.
5. **Verifikasi.** Daftar + filter, detail, verifikasi dokumen, transisi status, riwayat.
6. **Notifikasi.** Outbox, worker, template, pengaturan SMTP + email uji.
7. **Laporan.** Statistik dashboard, export CSV/Excel, data laporan cetak, activity log.
8. **Frontend publik dan pendaftar.**
9. **Frontend admin.**
10. **Penutup.** Uji konkurensi, checklist demo, bekukan tag RustFS, README.

### Deployment (server lokal)

| Service | Image | Port ke jaringan |
| --- | --- | --- |
| `nginx` | `nginx` | 80 (443 saat hosting). Meneruskan `/` ke api dan `/<bucket>/` ke rustfs dengan header `Host` asli |
| `api` | Build dari repo: API + SPA Vue, plus worker bila `RUN_WORKER=true` | Tidak dibuka, lewat nginx |
| `postgres` | `postgres` | Tidak dibuka |
| `rustfs` | `rustfs/rustfs:latest` → tag versi H-1 presentasi | Tidak dibuka; console lewat SSH tunnel |
| `mailpit` | `axllent/mailpit` (profil dev) | 8025 (UI) saat development |

Variabel `.env`: `DATABASE_URL`, `APP_KEY`, `APP_URL`, `RUN_WORKER`, `STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `SEED_ADMIN_PASSWORD`, `HTTP_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `LOCAL_STORAGE_DIR`. Opsional: `RUSTFS_TAG`, `SMTP_HOST_DOCKER`, `SMTP_PORT_DOCKER`, dan port host di `.env.example`.

Langkah instalasi ada di `README.md`: salin `.env.example` dan isi nilai rahasianya, `docker compose --profile dev up -d --build`, lalu jalankan skrip `init-storage`, `migrate`, dan `seed` di container `api`. Kredensial RustFS diambil dari `.env` dengan nilai acak, bukan bawaan; access key khusus aplikasi belum dibuat.

### Pengujian otomatis (`bun test`)

- 50 submit paralel ke event FCFS berkuota 10 → tepat 10 berhasil, 40 `QUOTA_FULL`, nomor registrasi unik dan berurutan.
- Dua staff menerima pendaftar berbeda bersamaan saat sisa kuota seleksi 1 → hanya satu yang berhasil.
- Dua staff menerima dan menolak pendaftaran yang sama bersamaan → satu berhasil, yang lain `INVALID_TRANSITION`.
- Staff menerima bersamaan dengan dokumen wajib ditandai `INVALID` atau diganti pendaftar → Terima ditolak bila dokumen tidak lagi `VALID`.
- Koreksi `REJECTED` → `UNDER_REVIEW` pada event FCFS yang sudah penuh ditolak `QUOTA_FULL`.
- Terima dan Waiting List ditolak selama ada dokumen wajib yang belum `VALID`.
- Verifikasi dokumen saat `SUBMITTED` atau `ACCEPTED` ditolak.
- Mengganti file `VALID` saat `SUBMITTED` mengembalikannya ke `PENDING`; saat `UNDER_REVIEW` penggantian file `VALID` ditolak dan file `INVALID` diterima.
- PUT ulang ke presigned URL setelah konfirmasi tidak mengubah file final; token driver lokal yang dipakai kedua kali ditolak.
- File pengganti yang gagal konfirmasi tidak menghapus file lama.
- Menghapus file setelah submit ditolak; syarat dokumen event yang sudah punya pendaftaran submit tidak bisa diubah.
- ZIP biasa yang diganti nama menjadi `.docx` ditolak.
- File EXE yang diganti nama menjadi `.jpg` dan file 6 MB ditolak dengan pesan aplikasi (bukan 413 dari Nginx), dengan driver `s3` maupun `local`.
- NIK ganda dan pendaftaran ganda di event yang sama ditolak.
- Semua transisi status yang tidak ada di tabel 6.5 ditolak `INVALID_TRANSITION`.
- Operator bisa membaca log satu pendaftar tapi tidak bisa membuka log global; pendaftar tidak bisa membuka pendaftaran orang lain.
- OTP kedaluwarsa dan OTP salah 5 kali ditolak.
- Satu pintu login memilah pendaftar dan staff, sesinya terpisah, pesan gagal sama, dan login gagal 5 kali diblok untuk kedua jenis akun.
- Urutan dokumen tetap setelah diverifikasi.
- Dashboard: antrean dari yang terlama, tanpa NIK dan email, jumlah email gagal hanya untuk admin.
- Daftar pendaftar dengan filter di bawah 500 ms pada 10.000 data.

### Checklist demo

Otomatis lewat `e2e/demo-checklist.mjs` (20 langkah di browser, lihat README).

- [ ] Pendaftar baru daftar akun, menerima OTP, verifikasi, login; admin masuk lewat halaman login yang sama (AK-01–AK-03)
- [ ] Pendaftar membuka event seleksi, memilih program, mengunggah dokumen, submit, menerima email bukti (PE-03–PE-06)
- [ ] Akun yang sama mendaftar ke event seminar FCFS tanpa mengisi profil ulang (6.4)
- [ ] Event FCFS penuh: pendaftar berikutnya mendapat pesan kuota penuh (6.2)
- [ ] Operator mencari pendaftar, membuka detail, memverifikasi dokumen, mengubah status; pendaftar menerima email (MP-01–MP-06)
- [ ] Operator menandai satu dokumen `INVALID`, pendaftar menerima email lalu mengganti berkas, operator menerima pendaftar (MP-04, 6.6)
- [ ] Kuota seleksi penuh: Terima terkunci, pendaftar dipindah ke Waiting List (6.2)
- [ ] Pendaftar melihat indikator tahapan, status, dan catatan di halaman Pendaftaran Saya (PE-07)
- [ ] Admin membuat event baru dengan syarat dokumen "Surat Persetujuan Desa" (EV-01, EV-03)
- [ ] Dashboard, grafik, antrean verifikasi, dan kalender tenggat sesuai data; export Excel dan laporan cetak (DA, LP)
- [ ] Admin mengganti pengaturan SMTP dan mengirim email uji (SS-04)
- [ ] Activity log menampilkan semua aksi di atas (SS-03)

### Pengembangan lanjutan

- Email lewat OAuth 2.0 dengan scope `gmail.send` untuk produksi.
- Antrean *waiting room* bila trafik mencapai ribuan pendaftar dalam hitungan detik; Valkey bila API dijalankan lebih dari satu instance.
- Kuota per program, status "perlu perbaikan", pembatalan oleh pendaftar, template email yang bisa diedit.
- Dokumen profil yang dipakai ulang antar event.
- Backup terjadwal database dan bucket.
- Memindahkan storage ke RustFS rilis stabil, atau ke Garage/SeaweedFS, cukup dengan mengganti endpoint.

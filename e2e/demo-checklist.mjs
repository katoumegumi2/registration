// Menjalankan checklist demo PRD bagian 12 lewat browser sungguhan, melalui Nginx.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:8080";
const MAIL = process.env.E2E_MAIL ?? "http://localhost:8025/api/v1";
const ADMIN_PW = process.argv[2];
const OUT = new URL("./shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const pdf = OUT + "contoh.pdf";
const png = OUT + "foto.png";
const exe = OUT + "virus.pdf";
writeFileSync(pdf, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]));
writeFileSync(exe, "MZ ini program windows");

const results = [];
const problems = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(["OK", name]);
    console.log("OK  ", name);
  } catch (e) {
    results.push(["GAGAL", name]);
    console.log("GAGAL", name, "\n   ", String(e.message).split("\n").slice(0, 4).join(" | "));
  }
}

const browser = await chromium.launch();
function watch(page, label) {
  page.on("pageerror", (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) problems.push(`[${label}] console: ${m.text()}`);
  });
}

async function latestOtp(email) {
  for (let i = 0; i < 20; i++) {
    const r = await (await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`)).json();
    if (r.messages?.[0]) {
      const m = await (await fetch(`${MAIL}/message/${r.messages[0].ID}`)).json();
      const code = m.Text.match(/\b\d{6}\b/);
      if (code) return code[0];
    }
    await new Promise((s) => setTimeout(s, 500));
  }
  throw new Error("OTP tidak sampai ke Mailpit");
}
async function mailCount(email, subject) {
  for (let i = 0; i < 24; i++) {
    const r = await (await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:${email} subject:"${subject}"`)}&limit=5`)).json();
    if (r.messages?.length) return r.messages.length;
    await new Promise((s) => setTimeout(s, 500));
  }
  return 0;
}

// ---------- Pendaftar di layar 360 px ----------
const mobile = await browser.newContext({ viewport: { width: 360, height: 740 }, baseURL: BASE });
const p = await mobile.newPage();
watch(p, "pendaftar");
const stamp = Date.now();
const email = `demo${stamp}@contoh.local`;
const nik = `3527${String(stamp).slice(-12)}`;

async function noOverflow(page, what) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 0) problems.push(`${what}: melebar ${over}px di 360 px`);
}

await step("Landing menampilkan 2 event, tanpa login", async () => {
  await p.goto("/");
  await p.waitForSelector("h3");
  if ((await p.locator("h3").count()) !== 2) throw new Error("jumlah event salah");
  await noOverflow(p, "landing");
  await p.screenshot({ path: OUT + "01-landing-360.png", fullPage: true });
});

await step("AK-01: validasi form daftar menolak NIK salah", async () => {
  await p.goto("/register");
  await p.getByLabel("NIK").fill("123");
  await p.getByRole("button", { name: "Daftar dan kirim kode OTP" }).click();
  await p.getByText("NIK harus 16 digit angka").waitFor();
  await noOverflow(p, "register");
});

await step("AK-01–03: daftar akun, OTP dari email, verifikasi, masuk", async () => {
  await p.getByLabel("NIK").fill(nik);
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Password").fill("RahasiaDemo123");
  await p.getByLabel("Nama lengkap").fill("Peserta Demo");
  await p.getByLabel("Jenis kelamin").selectOption("L");
  await p.getByLabel("No. HP").fill("081234567890");
  await p.getByLabel("Tempat lahir").fill("Sampang");
  await p.getByLabel("Tanggal lahir").fill("2001-05-17");
  await p.getByLabel("Alamat").fill("Jl. Demo 1");
  await p.getByRole("button", { name: "Daftar dan kirim kode OTP" }).click();
  await p.waitForURL(/\/verify/);
  await p.getByLabel("Kode OTP").fill("000000");
  await p.getByRole("button", { name: "Verifikasi" }).click();
  await p.getByText("Kode OTP salah").waitFor();
  await p.getByLabel("Kode OTP").fill(await latestOtp(email));
  await p.getByRole("button", { name: "Verifikasi" }).click();
  await p.waitForURL(/\/me$/);
  await p.getByRole("heading", { name: "Pendaftaran Saya" }).waitFor();
});

let pmbRegUrl = "";
await step("PE-03–06: event seleksi, pilih program, unggah, tolak file palsu, submit, email bukti", async () => {
  await p.goto("/events/pmb-2027");
  await p.getByRole("button", { name: "Daftar sekarang" }).click();
  await p.waitForURL(/\/me\/registrations\//);
  pmbRegUrl = p.url();
  await p.getByLabel("Program").selectOption({ label: "Sistem Informasi" });
  await p.getByRole("button", { name: "Lanjut" }).click();
  await p.getByRole("heading", { name: "Dokumen" }).waitFor();
  await noOverflow(p, "wizard");
  const inputs = p.locator('input[type=file]');
  await inputs.nth(0).setInputFiles(exe); // Ijazah
  await p.getByText("Format file tidak diterima").first().waitFor({ timeout: 15000 });
  for (const label of ["Ijazah", "KTP", "Pas Foto"]) {
    await p.getByRole("listitem").filter({ hasText: label }).locator("input[type=file]").setInputFiles(label === "Pas Foto" ? png : pdf);
    await p.getByRole("listitem").filter({ hasText: label }).getByText(/contoh\.pdf|foto\.png/).waitFor({ timeout: 15000 });
  }
  await p.screenshot({ path: OUT + "02-wizard-360.png", fullPage: true });
  await p.getByRole("button", { name: "Lanjut" }).click();
  await p.getByRole("button", { name: "Kirim pendaftaran" }).click();
  await p.getByRole("button", { name: "Kirim", exact: true }).click();
  await p.waitForURL(/receipt/);
  await p.getByText(/PMB-\d{4}-\d{4}/).waitFor();
  await p.screenshot({ path: OUT + "03-bukti-360.png", fullPage: true });
  await noOverflow(p, "bukti");
  if (!(await mailCount(email, "Bukti pendaftaran"))) throw new Error("email bukti tidak sampai");
});

await step("6.4: akun yang sama mendaftar seminar FCFS tanpa isi profil ulang", async () => {
  await p.goto("/events/seminar-digital-desa");
  await p.getByRole("button", { name: "Daftar sekarang" }).click();
  await p.waitForURL(/\/me\/registrations\//);
  await p.getByRole("listitem").filter({ hasText: "KTP" }).locator("input[type=file]").setInputFiles(pdf);
  await p.getByRole("listitem").filter({ hasText: "KTP" }).getByText("contoh.pdf").waitFor({ timeout: 15000 });
  await p.getByRole("button", { name: "Lanjut" }).click();
  await p.getByRole("button", { name: "Kirim pendaftaran" }).click();
  await p.getByRole("button", { name: "Kirim", exact: true }).click();
  await p.waitForURL(/receipt/);
  await p.getByText(/SEM-\d{4}-\d{4}/).waitFor();
});

await step("6.2: event FCFS penuh, tombol daftar nonaktif, sisa kuota 0", async () => {
  const other = await browser.newContext({ baseURL: BASE });
  const q = await other.newPage();
  await q.goto("/login");
  await q.getByLabel("Email atau username").fill("pendaftar8@contoh.local");
  await q.getByLabel("Password").fill("Pendaftar123");
  await q.getByRole("button", { name: "Masuk" }).click();
  await q.waitForURL(/\/me$/);
  await q.goto("/events/seminar-digital-desa");
  const btn = q.getByRole("button", { name: "Kuota penuh" });
  await btn.waitFor();
  if (!(await btn.isDisabled())) throw new Error("tombol tidak nonaktif");
  await q.getByText("Sisa 0 dari 9").waitFor();
  await other.close();
});

// ---------- Operator ----------
const desk = await browser.newContext({ viewport: { width: 1366, height: 850 }, baseURL: BASE, acceptDownloads: true });
const o = await desk.newPage();
watch(o, "operator");

await step("Satu halaman login: /admin/login dialihkan, username masuk ke panel, operator tanpa menu admin", async () => {
  await o.goto("/admin/login");
  await o.waitForURL(/\/login/);
  await o.getByLabel("Email atau username").fill("operator");
  await o.getByLabel("Password").fill("password-salah");
  await o.getByRole("button", { name: "Masuk" }).click();
  await o.getByText("Email/username atau password salah").waitFor();
  await o.getByLabel("Password").fill(ADMIN_PW);
  await o.getByRole("button", { name: "Masuk" }).click();
  await o.getByRole("heading", { name: "Dashboard" }).waitFor();
  if (await o.getByRole("link", { name: "Staff" }).count()) throw new Error("menu Staff terlihat oleh operator");
  await o.goto("/admin/staff");
  await o.getByRole("heading", { name: "Dashboard" }).waitFor();
});

await step("MP-01–02: cari pendaftar, NIK tersamar, filter tersimpan di URL", async () => {
  await o.goto("/admin/registrations");
  await o.getByRole("searchbox").fill("Peserta Demo");
  await o.waitForURL(/q=Peserta/);
  await o.waitForFunction(() => document.querySelectorAll('a[href^="/admin/registrations/"]').length === 2);
  await o.getByRole("link", { name: /PMB-/ }).waitFor();
  await o.getByText(`${nik.slice(0, 4)}********${nik.slice(-4)}`).first().waitFor();
  await o.reload();
  await o.getByRole("link", { name: /PMB-/ }).waitFor();
  if ((await o.getByRole("searchbox").inputValue()) !== "Peserta Demo") throw new Error("filter hilang setelah refresh");
  await o.screenshot({ path: OUT + "04-daftar-pendaftar.png" });
});

await step("MP-03–06 + 6.6: dokumen INVALID, email, pendaftar ganti berkas, penanda, lalu diterima", async () => {
  await o.getByRole("link", { name: /PMB-/ }).click();
  await o.getByRole("heading", { name: "Peserta Demo" }).waitFor();
  await o.getByText(nik, { exact: true }).waitFor();
  await o.getByRole("button", { name: "Mulai tinjau" }).click();
  await o.getByRole("button", { name: "Ubah status" }).click();
  await o.getByRole("button", { name: "Tidak valid" }).first().waitFor();
  const accept = o.getByRole("button", { name: "Terima" });
  if (!(await accept.isDisabled())) throw new Error("Terima seharusnya nonaktif, dokumen belum valid");
  await o.getByText(/Dokumen wajib belum VALID/).first().waitFor();
  await o.getByRole("listitem").filter({ hasText: "Ijazah" }).getByRole("button", { name: "Pratinjau" }).click();
  await o.locator("iframe").waitFor();
  await o.screenshot({ path: OUT + "05-pratinjau.png" });
  await o.keyboard.press("Escape");
  await o.getByRole("listitem").filter({ hasText: "Ijazah" }).getByRole("button", { name: "Tidak valid" }).click();
  await o.getByLabel("Catatan untuk pendaftar").fill("Scan buram, mohon unggah ulang.");
  await o.getByRole("button", { name: "Simpan" }).click();
  await o.getByText("Scan buram").first().waitFor();
  if (!(await mailCount(email, "Berkas perlu diganti"))) throw new Error("email INVALID tidak sampai");

  await p.goto("/me");
  await p.getByText("Berkas perlu diganti:").waitFor();
  await p.getByText("Panitia meminta 1 dokumen diganti").first().waitFor();
  await p.goto(pmbRegUrl);
  const ktp = p.getByRole("listitem").filter({ hasText: "KTP" });
  if (await ktp.locator("input[type=file]").count()) throw new Error("file KTP seharusnya terkunci");
  const ijazah = p.getByRole("listitem").filter({ hasText: "Ijazah" });
  await ijazah.locator("input[type=file]").setInputFiles(pdf);
  await ijazah.getByText("Menunggu").waitFor({ timeout: 15000 });

  await o.goto("/admin/registrations?q=Peserta");
  await o.getByText("Berkas diperbarui").waitFor();
  await o.getByRole("row").filter({ hasText: "Berkas diperbarui" }).getByRole("link", { name: /PMB-/ }).click();
  await o.getByRole("heading", { name: "Peserta Demo" }).waitFor();
  await o.getByText("Diperbarui").waitFor();
  for (const label of ["Ijazah", "KTP", "Pas Foto"]) {
    await o.getByRole("listitem").filter({ hasText: label }).getByRole("button", { name: "Valid", exact: true }).click();
    await o.getByRole("button", { name: "Simpan" }).click();
    await o.getByRole("listitem").filter({ hasText: label }).getByText("Valid", { exact: true }).first().waitFor();
    await o.getByRole("dialog").waitFor({ state: "detached" });
  }
  await o.screenshot({ path: OUT + "06-detail-pendaftar.png", fullPage: true });
  await o.getByRole("button", { name: "Terima" }).click();
  await o.getByRole("button", { name: "Ubah status" }).click();
  await o.getByRole("dialog").waitFor({ state: "detached" });
  await o.getByText("Accepted").first().waitFor();
  if (!(await mailCount(email, "Accepted"))) throw new Error("email perubahan status tidak sampai");
});

await step("6.2: kuota seleksi penuh, Terima terkunci, pendaftar dipindah ke Waiting List", async () => {
  await o.goto("/admin/registrations?status=UNDER_REVIEW&q=PMB");
  await o.getByRole("link", { name: /PMB-/ }).first().click();
  await o.getByRole("button", { name: "Waiting List" }).waitFor();
  const n = await o.getByRole("button", { name: "Valid", exact: true }).count();
  for (let i = 0; i < n; i++) {
    await o.getByRole("button", { name: "Valid", exact: true }).nth(i).click();
    await o.getByRole("button", { name: "Simpan" }).click();
    await o.getByRole("dialog").waitFor({ state: "detached" });
    // Tunggu status dokumen benar-benar tercatat sebelum lanjut ke dokumen berikutnya.
    await o.locator("span:has(> i.fa-check)").nth(i).waitFor();
  }
  const accept = o.getByRole("button", { name: "Terima" });
  const shown = await o.getByRole("heading", { name: "Ubah status" }).locator("..").innerText();
  await o.getByText("Kuota penuh").waitFor({ timeout: 8000 }).catch((e) => { throw new Error(`Isi kartu status: ${shown.replace(/\s+/g, " ")} | ${e.message.split("\n")[0]}`); });
  if (!(await accept.isDisabled())) throw new Error("Terima seharusnya terkunci");
  await o.screenshot({ path: OUT + "07-kuota-penuh.png" });
  await o.getByRole("button", { name: "Waiting List" }).click();
  await o.getByRole("button", { name: "Ubah status" }).click();
  await o.getByRole("dialog").waitFor({ state: "detached" });
  await o.getByText("Waiting List").first().waitFor();
});

await step("PE-07: pendaftar melihat status dan riwayat di Pendaftaran Saya", async () => {
  await p.goto("/me");
  await p.getByText("Accepted").first().waitFor();
  await p.getByText("Selamat, pendaftaran Anda diterima.").first().waitFor();
  await p.getByText("Riwayat status").first().click();
  await p.getByText(/WIB/).first().waitFor();
  await noOverflow(p, "pendaftaran saya");
  await p.screenshot({ path: OUT + "08-pendaftaran-saya-360.png", fullPage: true });
});

// ---------- Admin ----------
const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 850 }, baseURL: BASE, acceptDownloads: true });
const a = await adminCtx.newPage();
watch(a, "admin");
await step("EV-01, EV-03: admin membuat event dengan syarat Surat Persetujuan Desa", async () => {
  await a.goto("/login");
  await a.getByLabel("Email atau username").fill("admin");
  await a.getByLabel("Password").fill(ADMIN_PW);
  await a.getByRole("button", { name: "Masuk" }).click();
  await a.getByRole("heading", { name: "Dashboard" }).waitFor();
  await a.goto("/admin/events/new");
  await a.getByLabel("Nama", { exact: false }).first().fill("Pelatihan Perangkat Desa");
  await a.getByLabel("Jenis").first().selectOption("PELATIHAN");
  await a.getByLabel("Status").selectOption("PUBLISHED");
  await a.getByLabel("Prefix nomor registrasi").fill("PLT");
  await a.getByLabel("Mulai (WIB)").fill("2026-10-01T08:00");
  await a.getByLabel("Selesai (WIB)").fill("2027-02-01T17:00");
  await a.getByLabel(/^Kuota/).fill("30");
  await a.getByLabel("Jenis dokumen baru").fill("Surat Persetujuan Desa");
  await a.getByRole("button", { name: "Tambah jenis" }).click();
  await a.getByRole("checkbox", { name: "Surat Persetujuan Desa" }).waitFor();
  await a.getByRole("button", { name: "Simpan event" }).click();
  await a.waitForURL(/\/admin\/events\/[0-9a-f-]{36}/);
  await a.getByRole("heading", { name: "Pelatihan Perangkat Desa" }).waitFor();
  await a.screenshot({ path: OUT + "09-form-event.png", fullPage: true });
  const r = await a.request.get(`${BASE}/api/v1/events`);
  const list = (await r.json()).data;
  const ev = list.find((e) => e.name === "Pelatihan Perangkat Desa");
  if (!ev) throw new Error("event tidak tampil di publik");
  const d = (await (await a.request.get(`${BASE}/api/v1/events/${ev.slug}`)).json()).data;
  if (!d.requirements.some((x) => x.name === "Surat Persetujuan Desa" && x.is_required)) throw new Error("syarat tidak tersimpan");
});

await step("EV-04: mode kuota terkunci pada event yang sudah ada pendaftar", async () => {
  await a.goto("/admin/events");
  await a.getByRole("link", { name: "Penerimaan Mahasiswa Baru 2027" }).click();
  await a.getByText("Sudah ada pendaftaran yang submit").waitFor();
  if (!(await a.getByLabel("Mode kuota").isDisabled())) throw new Error("mode kuota tidak terkunci");
});

await step("DA: dashboard dan grafik sesuai data daftar pendaftar", async () => {
  await a.goto("/admin");
  await a.locator("canvas").nth(1).waitFor();
  await a.waitForTimeout(1200);
  await a.screenshot({ path: OUT + "10-dashboard.png", fullPage: true });
  const stats = (await (await a.request.get(`${BASE}/api/v1/admin/dashboard/stats`)).json()).data;
  const list = (await (await a.request.get(`${BASE}/api/v1/admin/registrations`)).json()).data;
  if (stats.total !== list.total) throw new Error(`dashboard ${stats.total} != daftar ${list.total}`);
  await a.getByText(String(stats.total), { exact: true }).first().waitFor();
});

await step("LP-01: export Excel dan CSV terunduh, berisi NIK lengkap", async () => {
  await a.goto("/admin/registrations");
  await a.getByRole("link", { name: /PMB-|SEM-/ }).first().waitFor();
  const [dl] = await Promise.all([a.waitForEvent("download"), a.getByRole("button", { name: "Excel" }).click()]);
  if (!dl.suggestedFilename().endsWith(".xlsx")) throw new Error("nama file salah");
  await dl.saveAs(OUT + "export.xlsx");
  const [dl2] = await Promise.all([a.waitForEvent("download"), a.getByRole("button", { name: "CSV" }).click()]);
  await dl2.saveAs(OUT + "export.csv");
  const { readFileSync } = await import("node:fs");
  if (!readFileSync(OUT + "export.csv", "utf8").includes(nik)) throw new Error("NIK lengkap tidak ada di CSV");
});

await step("LP-02: laporan cetak A4 tersimpan sebagai PDF", async () => {
  await a.goto("/admin/reports");
  await a.getByRole("combobox").selectOption({ label: "Penerimaan Mahasiswa Baru 2027" });
  await a.getByText("Laporan Pendaftaran:").waitFor();
  await a.pdf({ path: OUT + "laporan.pdf", format: "A4" });
  await a.emulateMedia({ media: "print" });
  await a.setViewportSize({ width: 794, height: 1123 });
  await a.screenshot({ path: OUT + "11-laporan-cetak.png" });
  await a.emulateMedia({ media: "screen" });
  await a.setViewportSize({ width: 1366, height: 850 });
});

await step("SS-04: admin mengganti SMTP dan mengirim email uji", async () => {
  await a.goto("/admin/settings");
  await a.getByLabel("Host").fill("mailpit");
  await a.getByLabel("Port").fill("1025");
  await a.getByLabel("Keamanan").selectOption("NONE");
  await a.getByLabel("Alamat pengirim").fill("panitia@contoh.local");
  await a.getByLabel("Nama pengirim").fill("Panitia Demo");
  await a.getByLabel("Kirim email uji ke").fill("uji-smtp@contoh.local");
  await a.getByRole("button", { name: "Kirim email uji" }).click();
  await a.getByText("Email uji dikirim").first().waitFor({ timeout: 15000 });
  if (!(await mailCount("uji-smtp@contoh.local", "Email uji"))) throw new Error("email uji tidak sampai");
  await a.getByRole("button", { name: "Simpan pengaturan email" }).click();
  await a.getByText("Pengaturan email disimpan").first().waitFor();
  await a.screenshot({ path: OUT + "12-pengaturan.png", fullPage: true });
});

await step("SS-03: activity log menampilkan aksi di atas; outbox terkirim", async () => {
  await a.goto("/admin/activity-logs");
  await a.getByText("STAFF_LOGIN").first().waitFor();
  for (const action of ["STATUS_CHANGED", "DOCUMENT_VERIFIED", "REPORT_EXPORTED", "SETTINGS_CHANGED", "REGISTRATION_SUBMITTED", "EVENT_CREATED", "DOCUMENT_REPLACED"]) {
    const r = (await (await a.request.get(`${BASE}/api/v1/admin/activity-logs?action=${action}`)).json()).data;
    if (!r.total) throw new Error(`tidak ada log ${action}`);
  }
  const ips = (await (await a.request.get(`${BASE}/api/v1/admin/activity-logs?action=STAFF_LOGIN`)).json()).data.rows.map((x) => x.ipAddress);
  if (ips.includes("unknown") || !ips[0]) throw new Error("IP klien tidak tercatat");
  await a.screenshot({ path: OUT + "13-activity-log.png" });
  await a.goto("/admin/notifications");
  await a.getByRole("cell", { name: "Terkirim" }).first().waitFor();
  const failed = (await (await a.request.get(`${BASE}/api/v1/admin/notifications?status=FAILED`)).json()).data.total;
  if (failed) throw new Error(`${failed} email gagal`);
});

await step("Hak akses di browser: akun pendaftar lain tidak bisa membuka pendaftaran ini", async () => {
  const other = await browser.newContext({ baseURL: BASE });
  const q = await other.newPage();
  await q.goto("/login");
  await q.getByLabel("Email atau username").fill("pendaftar9@contoh.local");
  await q.getByLabel("Password").fill("Pendaftar123");
  await q.getByRole("button", { name: "Masuk" }).click();
  await q.waitForURL(/\/me$/);
  await q.goto(pmbRegUrl);
  await q.getByText("Pendaftaran tidak ditemukan").waitFor();
  await other.close();
});

await step("Dokumentasi API terbuka di /docs dan memuat spesifikasi", async () => {
  const spec = await (await fetch(`${BASE}/api/v1/openapi.json`)).json();
  if (Object.keys(spec.paths).length < 40) throw new Error(`hanya ${Object.keys(spec.paths).length} path`);
  console.log("     path OpenAPI:", Object.keys(spec.paths).length);
});

await browser.close();
const fail = results.filter((r) => r[0] !== "OK");
console.log(`\n${results.length - fail.length} dari ${results.length} langkah lolos`);
if (problems.length) console.log("Masalah tambahan:\n" + [...new Set(problems)].map((x) => "  - " + x).join("\n"));
process.exit(fail.length ? 1 : 0);

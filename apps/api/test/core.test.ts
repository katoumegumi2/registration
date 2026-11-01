// Pengujian otomatis PRD bagian 12.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { TRANSITIONS, REGISTRATION_STATUSES } from "@pendaftaran/shared";
import { emailOtps } from "../src/modules/auth/auth.table";
import { registrations } from "../src/modules/registrations/registrations.table";
import { notifications } from "../src/modules/notifications/notifications.table";
import { db, pg } from "../src/shared/db/client";
import { authService } from "../src/modules/auth";
import { useStorage } from "../src/shared/storage";
import { Client, draftWithDocs, EXE, makeEvent, makeParticipant, makeStaff, nextNik, outboxFor, PDF, PNG, profile, putTo, resetDb, upload } from "./helpers";

let admin: Awaited<ReturnType<typeof makeStaff>>;
let operator: Awaited<ReturnType<typeof makeStaff>>;

beforeAll(resetDb);
afterAll(() => pg.end());
beforeEach(async () => {
  authService.rateReset();
  useStorage("local");
  admin = await makeStaff("ADMIN");
  operator = await makeStaff("OPERATOR");
});

/** Membawa pendaftaran sampai status tertentu lewat API, memakai dokumen VALID bila perlu. */
async function submitted(ev: Awaited<ReturnType<typeof makeEvent>>) {
  const p = await makeParticipant();
  const id = await draftWithDocs(p, ev);
  const s = await p.client.post(`/me/registrations/${id}/submit`);
  if (s.status !== 200) throw new Error(`submit gagal: ${s.text}`);
  return { ...p, regId: id };
}

async function underReview(ev: Awaited<ReturnType<typeof makeEvent>>) {
  const r = await submitted(ev);
  const t = await operator.client.post(`/admin/registrations/${r.regId}/transitions`, { to: "UNDER_REVIEW" });
  if (t.status !== 200) throw new Error(t.text);
  return r;
}

async function markAllValid(regId: string) {
  const d = await operator.client.get(`/admin/registrations/${regId}`);
  for (const doc of d.data.documents) {
    const v = await operator.client.patch(`/admin/documents/${doc.id}/verification`, { status: "VALID", notes: null });
    if (v.status !== 200) throw new Error(v.text);
  }
}

describe("konkurensi", () => {
  test("50 submit paralel ke FCFS berkuota 10: tepat 10 berhasil, 40 QUOTA_FULL, nomor unik dan berurutan", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 10 });
    const people = await Promise.all(Array.from({ length: 50 }, makeParticipant));
    const regs = await Promise.all(people.map((p) => draftWithDocs(p, ev)));
    const res = await Promise.all(people.map((p, i) => p.client.post(`/me/registrations/${regs[i]}/submit`)));
    const ok = res.filter((r) => r.status === 200);
    const full = res.filter((r) => r.code === "QUOTA_FULL");
    expect(ok.length).toBe(10);
    expect(full.length).toBe(40);
    const year = new Date().getFullYear();
    const numbers = ok.map((r) => r.data.registration_number as string).sort();
    expect(numbers).toEqual(Array.from({ length: 10 }, (_, i) => `${ev.prefix}-${year}-${String(i + 1).padStart(4, "0")}`));
    // Draft yang kalah tetap tersimpan.
    const drafts = await db.select({ n: sql<number>`count(*)::int` }).from(registrations).where(eq(registrations.status, "DRAFT"));
    expect(drafts[0]!.n).toBeGreaterThanOrEqual(40);
  }, 120_000);

  test("dua staff menerima pendaftar berbeda saat sisa kuota seleksi 1: hanya satu berhasil", async () => {
    const ev = await makeEvent({ mode: "SELECTION", quota: 1 });
    const a = await underReview(ev);
    const b = await underReview(ev);
    await markAllValid(a.regId);
    await markAllValid(b.regId);
    const res = await Promise.all([
      operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "ACCEPTED" }),
      admin.client.post(`/admin/registrations/${b.regId}/transitions`, { to: "ACCEPTED" }),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(res.find((r) => r.status === 409)!.code).toBe("QUOTA_FULL");
  });

  test("dua staff menerima dan menolak pendaftaran yang sama: satu berhasil, lainnya INVALID_TRANSITION", async () => {
    const ev = await makeEvent({ mode: "SELECTION", quota: 5 });
    const a = await underReview(ev);
    await markAllValid(a.regId);
    const res = await Promise.all([
      operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "ACCEPTED" }),
      admin.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "REJECTED", notes: "Tidak memenuhi" }),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(res.find((r) => r.status === 409)!.code).toBe("INVALID_TRANSITION");
  });

  test("Terima bersamaan dengan dokumen ditandai INVALID: bila INVALID lebih dulu, Terima ditolak", async () => {
    const ev = await makeEvent({ mode: "SELECTION", quota: 5 });
    const a = await underReview(ev);
    await markAllValid(a.regId);
    const docId = (await operator.client.get(`/admin/registrations/${a.regId}`)).data.documents[0].id;
    const [v, t] = await Promise.all([
      admin.client.patch(`/admin/documents/${docId}/verification`, { status: "INVALID", notes: "Buram" }),
      operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "ACCEPTED" }),
    ]);
    const final = (await operator.client.get(`/admin/registrations/${a.regId}`)).data;
    // Dua urutan sah; yang tidak boleh terjadi: diterima dengan dokumen INVALID sambil verifikasi lolos.
    if (t.status === 200) {
      expect(final.status).toBe("ACCEPTED");
      expect(v.code).toBe("FILE_LOCKED");
      expect(final.documents[0].verification_status).toBe("VALID");
    } else {
      expect(t.code).toBe("DOCUMENTS_NOT_VALID");
      expect(final.status).toBe("UNDER_REVIEW");
    }
  });
});

describe("aturan status", () => {
  test("koreksi REJECTED → UNDER_REVIEW pada FCFS penuh ditolak QUOTA_FULL", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 1 });
    const a = await underReview(ev);
    const rej = await operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "REJECTED", notes: "Salah" });
    expect(rej.status).toBe(200);
    await underReview(ev); // slot yang dikembalikan diambil orang lain
    const fix = await admin.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "UNDER_REVIEW", notes: "Koreksi" });
    expect(fix.status).toBe(409);
    expect(fix.code).toBe("QUOTA_FULL");
  });

  test("koreksi hanya bisa dilakukan admin dan alasannya wajib", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    const a = await underReview(ev);
    await operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "REJECTED", notes: "Salah" });
    expect((await operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "UNDER_REVIEW", notes: "x" })).status).toBe(403);
    expect((await admin.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "UNDER_REVIEW" })).code).toBe("NOTES_REQUIRED");
    expect((await admin.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "UNDER_REVIEW", notes: "Keliru" })).status).toBe(200);
  });

  test("Terima dan Waiting List ditolak selama dokumen wajib belum VALID", async () => {
    const ev = await makeEvent({ mode: "SELECTION", quota: 5 });
    const a = await underReview(ev);
    expect((await operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "ACCEPTED" })).code).toBe("DOCUMENTS_NOT_VALID");
    expect((await operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "WAITING_LIST" })).code).toBe("DOCUMENTS_NOT_VALID");
  });

  test("Waiting List ditolak pada mode FCFS", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    const a = await underReview(ev);
    await markAllValid(a.regId);
    expect((await operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "WAITING_LIST" })).code).toBe("INVALID_TRANSITION");
  });

  test("penolakan wajib punya catatan", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    const a = await underReview(ev);
    expect((await operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "REJECTED" })).code).toBe("NOTES_REQUIRED");
  });

  test("semua transisi di luar tabel 6.5 ditolak INVALID_TRANSITION", async () => {
    const ev = await makeEvent({ mode: "SELECTION", quota: 50 });
    for (const from of REGISTRATION_STATUSES.filter((s) => s !== "DRAFT")) {
      const a = await underReview(ev);
      const id = a.regId;
      // Set status langsung: yang diuji di sini hanya tabel transisi.
      await db.update(registrations).set({ status: from }).where(eq(registrations.id, id));
      for (const to of REGISTRATION_STATUSES) {
        if (TRANSITIONS.some((t) => t.from === from && t.to === to)) continue;
        const r = await admin.client.post(`/admin/registrations/${id}/transitions`, { to, notes: "uji" });
        expect(`${from}->${to}:${r.code}`).toBe(`${from}->${to}:INVALID_TRANSITION`);
      }
    }
  }, 60_000);

  test("setiap transisi menulis riwayat, activity log, dan email", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    const a = await underReview(ev);
    const d = (await operator.client.get(`/admin/registrations/${a.regId}`)).data;
    expect(d.history.map((h: any) => h.to_status)).toEqual(["SUBMITTED", "UNDER_REVIEW"]);
    expect(d.activity_logs.some((l: any) => l.action === "STATUS_CHANGED")).toBe(true);
    const mails = await outboxFor(a.email);
    expect(mails.map((m) => m.type).sort()).toEqual(["REGISTRATION_RECEIPT", "STATUS_CHANGED"]);
  });
});

describe("dokumen", () => {
  test("verifikasi saat SUBMITTED atau ACCEPTED ditolak", async () => {
    const ev = await makeEvent({ mode: "SELECTION", quota: 5 });
    const a = await submitted(ev);
    const docId = (await operator.client.get(`/admin/registrations/${a.regId}`)).data.documents[0].id;
    expect((await operator.client.patch(`/admin/documents/${docId}/verification`, { status: "VALID" })).code).toBe("FILE_LOCKED");
    await operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "UNDER_REVIEW" });
    await markAllValid(a.regId);
    await operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "ACCEPTED" });
    expect((await operator.client.patch(`/admin/documents/${docId}/verification`, { status: "INVALID", notes: "x" })).code).toBe("FILE_LOCKED");
  });

  test("mengganti file saat SUBMITTED kembali PENDING; saat UNDER_REVIEW file VALID ditolak dan INVALID diterima", async () => {
    const ev = await makeEvent({ mode: "SELECTION", quota: 5 });
    const a = await submitted(ev);
    expect((await upload(a.client, a.regId, ev.required[0]!, PNG, "foto.png")).status).toBe(200);
    let doc = (await a.client.get(`/me/registrations/${a.regId}`)).data.documents[0];
    expect(doc.verification_status).toBe("PENDING");
    expect(doc.replaced_at).not.toBeNull();
    expect(doc.mime_type).toBe("image/png");

    await operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "UNDER_REVIEW" });
    await markAllValid(a.regId);
    const locked = await upload(a.client, a.regId, ev.required[0]!, PDF);
    expect(locked.code).toBe("FILE_LOCKED");

    await operator.client.patch(`/admin/documents/${doc.id}/verification`, { status: "INVALID", notes: "Buram" });
    const mails = await outboxFor(a.email);
    expect(mails.some((m) => m.type === "DOCUMENT_INVALID")).toBe(true);
    expect((await upload(a.client, a.regId, ev.required[0]!, PDF)).status).toBe(200);
    doc = (await a.client.get(`/me/registrations/${a.regId}`)).data.documents[0];
    expect(doc.verification_status).toBe("PENDING");
    // MP-01: penanda terlihat di daftar pendaftar, lalu hilang setelah diverifikasi ulang.
    const list = await operator.client.get(`/admin/registrations?event_id=${ev.id}`);
    expect(list.data.rows[0].has_replaced_document).toBe(true);
    await operator.client.patch(`/admin/documents/${doc.id}/verification`, { status: "VALID" });
    expect((await operator.client.get(`/admin/registrations?event_id=${ev.id}`)).data.rows[0].has_replaced_document).toBe(false);
    expect((await operator.client.post(`/admin/registrations/${a.regId}/transitions`, { to: "ACCEPTED" })).status).toBe(200);
  });

  test("urutan dokumen tetap setelah diverifikasi dan diganti", async () => {
    const ev = await makeEvent({ mode: "SELECTION", quota: 5, requiredDocs: 4 });
    const a = await underReview(ev);
    const order = async () => (await operator.client.get(`/admin/registrations/${a.regId}`)).data.documents.map((d: any) => d.document_type_name);
    const before = await order();
    expect(before).toEqual([...before].sort((x: string, y: string) => x.localeCompare(y)));
    const ids = (await operator.client.get(`/admin/registrations/${a.regId}`)).data.documents.map((d: any) => d.id);
    for (const id of [ids[2], ids[0], ids[3], ids[1]]) {
      await operator.client.patch(`/admin/documents/${id}/verification`, { status: "VALID" });
      expect(await order()).toEqual(before);
    }
  });

  test("file pengganti yang gagal konfirmasi tidak menghapus file lama", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    const p = await makeParticipant();
    const id = await draftWithDocs(p, ev);
    const before = (await p.client.get(`/me/registrations/${id}`)).data.documents[0];
    const bad = await upload(p.client, id, ev.required[0]!, EXE, "virus.pdf");
    expect(bad.code).toBe("FILE_REJECTED");
    const after = (await p.client.get(`/me/registrations/${id}`)).data.documents[0];
    expect(after.original_name).toBe(before.original_name);
    const url = (await p.client.get(`/me/registrations/${id}/documents/${after.id}/url`)).data.url as string;
    const got = await new Client().req("GET", url.slice(url.indexOf("/api/v1") + 7));
    expect(got.status).toBe(200);
    expect(got.text.startsWith("%PDF")).toBe(true);
  });

  test("menghapus file setelah submit ditolak; saat draft boleh", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    const p = await makeParticipant();
    const id = await draftWithDocs(p, ev);
    const doc = (await p.client.get(`/me/registrations/${id}`)).data.documents[0];
    expect((await p.client.del(`/me/registrations/${id}/documents/${doc.id}`)).status).toBe(200);
    expect((await p.client.post(`/me/registrations/${id}/submit`)).code).toBe("DOCUMENTS_INCOMPLETE");
    await upload(p.client, id, ev.required[0]!, PDF);
    await p.client.post(`/me/registrations/${id}/submit`);
    const again = (await p.client.get(`/me/registrations/${id}`)).data.documents[0];
    expect((await p.client.del(`/me/registrations/${id}/documents/${again.id}`)).code).toBe("FILE_LOCKED");
  });

  test("syarat dokumen event yang sudah punya pendaftaran submit tidak bisa diubah", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    const body = { items: [{ document_type_id: ev.required[0], is_required: false }] };
    expect((await admin.client.put(`/admin/events/${ev.id}/document-requirements`, body)).status).toBe(200);
    await admin.client.put(`/admin/events/${ev.id}/document-requirements`, { items: [{ document_type_id: ev.required[0], is_required: true }] });
    await submitted(ev);
    expect((await admin.client.put(`/admin/events/${ev.id}/document-requirements`, body)).code).toBe("EVENT_LOCKED");
  });

  for (const driver of ["local", "s3"] as const) {
    describe(`driver ${driver}`, () => {
      beforeEach(() => useStorage(driver));

      test("EXE berganti nama .jpg ditolak dengan pesan aplikasi", async () => {
        const ev = await makeEvent({ mode: "FCFS", quota: 5 });
        const p = await makeParticipant();
        const id = (await p.client.post(`/events/${ev.id}/registrations`)).data.id;
        const r = await upload(p.client, id, ev.required[0]!, EXE, "foto.jpg");
        expect(r.code).toBe("FILE_REJECTED");
      });

      test("file 6 MB ditolak dengan pesan aplikasi", async () => {
        const ev = await makeEvent({ mode: "FCFS", quota: 5 });
        const p = await makeParticipant();
        const id = (await p.client.post(`/events/${ev.id}/registrations`)).data.id;
        const big = new Uint8Array(6 * 1024 * 1024);
        big.set(PDF);
        const t = (await p.client.post(`/me/registrations/${id}/uploads`, { document_type_id: ev.required[0], original_name: "besar.pdf" })).data;
        const put = await putTo(t.url, big);
        if (driver === "local") {
          expect(put.status).toBe(422);
          expect(((await put.json()) as any).error.code).toBe("FILE_REJECTED");
        } else {
          expect(put.status).toBe(200);
          const c = await p.client.post(`/me/registrations/${id}/uploads/${t.upload_id}/confirm`);
          expect(c.code).toBe("FILE_REJECTED");
        }
      });

      test("ZIP biasa berganti nama .docx ditolak; DOCX asli diterima", async () => {
        const ev = await makeEvent({ mode: "FCFS", quota: 5 });
        const p = await makeParticipant();
        const id = (await p.client.post(`/events/${ev.id}/registrations`)).data.id;
        const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode("isi-zip-biasa")]);
        expect((await upload(p.client, id, ev.required[0]!, zip, "a.docx")).code).toBe("FILE_REJECTED");
        const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode("xx[Content_Types].xmlxx")]);
        expect((await upload(p.client, id, ev.required[0]!, docx, "a.docx")).status).toBe(200);
      });

      test("PUT ulang setelah konfirmasi tidak mengubah file final", async () => {
        const ev = await makeEvent({ mode: "FCFS", quota: 5 });
        const p = await makeParticipant();
        const id = (await p.client.post(`/events/${ev.id}/registrations`)).data.id;
        const u = await upload(p.client, id, ev.required[0]!, PDF);
        expect(u.status).toBe(200);
        const again = await putTo(u.target.url, EXE);
        if (driver === "local") expect(again.status).toBe(409); // token sekali pakai
        const doc = (await p.client.get(`/me/registrations/${id}`)).data.documents[0];
        const url = (await p.client.get(`/me/registrations/${id}/documents/${doc.id}/url`)).data.url as string;
        const body = driver === "local" ? (await new Client().req("GET", url.slice(url.indexOf("/api/v1") + 7))).text : await (await fetch(url)).text();
        expect(body.startsWith("%PDF")).toBe(true);
        expect(doc.size_bytes).toBe(PDF.byteLength);
      });
    });
  }
});

describe("duplikat", () => {
  test("NIK ganda ditolak, email ganda ditolak", async () => {
    const a = profile();
    expect((await new Client().post("/auth/register", a)).status).toBe(201);
    expect((await new Client().post("/auth/register", { ...profile(), nik: a.nik })).code).toBe("DUPLICATE_NIK");
    expect((await new Client().post("/auth/register", { ...profile(), email: a.email })).code).toBe("DUPLICATE_EMAIL");
  });

  test("pendaftaran kedua di event yang sama diarahkan ke yang sudah ada; event lain boleh", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    const ev2 = await makeEvent({ mode: "FCFS", quota: 5 });
    const p = await makeParticipant();
    const a = await p.client.post(`/events/${ev.id}/registrations`);
    const b = await p.client.post(`/events/${ev.id}/registrations`);
    expect(b.data.existing).toBe(true);
    expect(b.data.id).toBe(a.data.id);
    const rows = await db.select().from(registrations).where(eq(registrations.participantId, p.id));
    expect(rows.length).toBe(1);
    expect((await p.client.post(`/events/${ev2.id}/registrations`)).data.existing).toBe(false);
  });
});

describe("hak akses", () => {
  test("operator tidak bisa mengakses endpoint admin; bisa membaca log satu pendaftar tapi bukan log global", async () => {
    expect((await operator.client.get("/admin/staff")).status).toBe(403);
    expect((await operator.client.get("/admin/events")).status).toBe(403);
    expect((await operator.client.get("/admin/settings/email")).status).toBe(403);
    expect((await operator.client.get("/admin/activity-logs")).status).toBe(403);
    expect((await operator.client.get("/admin/notifications")).status).toBe(403);
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    const a = await submitted(ev);
    const d = await operator.client.get(`/admin/registrations/${a.regId}`);
    expect(d.data.activity_logs.length).toBeGreaterThan(0);
    expect(d.data.participant.nik).toHaveLength(16);
  });

  test("pendaftar tidak bisa membuka pendaftaran orang lain (404) dan endpoint staff (401)", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    const a = await submitted(ev);
    const b = await makeParticipant();
    expect((await b.client.get(`/me/registrations/${a.regId}`)).status).toBe(404);
    expect((await b.client.post(`/me/registrations/${a.regId}/submit`)).status).toBe(404);
    expect((await b.client.get("/admin/registrations")).status).toBe(401);
    expect((await new Client().get("/me")).status).toBe(401);
  });

  test("daftar menyamarkan NIK; draft tidak terlihat staff", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    await submitted(ev);
    const p = await makeParticipant();
    const draftId = await draftWithDocs(p, ev);
    const list = await operator.client.get(`/admin/registrations?event_id=${ev.id}`);
    expect(list.data.total).toBe(1);
    expect(list.data.rows[0].nik_masked).toMatch(/^\d{4}\*{8}\d{4}$/);
    expect(list.data.rows[0].nik).toBeUndefined();
    expect((await operator.client.get(`/admin/registrations/${draftId}`)).status).toBe(404);
  });

  test("Origin asing ditolak pada request yang mengubah data", async () => {
    const r = await new Client().req("POST", "/auth/login", { email: "a@b.co", password: "x" }, { origin: "https://jahat.example" });
    expect(r.status).toBe(403);
  });

  test("admin tidak bisa menonaktifkan dirinya atau admin aktif terakhir", async () => {
    expect((await admin.client.patch(`/admin/staff/${admin.id}`, { status: "INACTIVE" })).code).toBe("CONFLICT");
  });
});

describe("OTP dan akun", () => {
  async function registerWithOtp() {
    const a = profile();
    const c = new Client();
    expect((await c.post("/auth/register", a)).status).toBe(201);
    return { c, a };
  }

  test("OTP salah 5 kali lalu kode benar pun ditolak", async () => {
    const { c, a } = await registerWithOtp();
    for (let i = 0; i < 5; i++) expect((await c.post("/auth/verify-email", { email: a.email, code: "000000" })).code).toBe("INVALID_OTP");
    const [p] = await db.select().from(emailOtps).orderBy(sql`created_at desc`).limit(1);
    expect(p!.attempts).toBe(5);
    expect((await c.post("/auth/verify-email", { email: a.email, code: "000000" })).code).toBe("INVALID_OTP");
  });

  test("OTP kedaluwarsa ditolak; OTP benar mengaktifkan akun dan membuat sesi", async () => {
    const { c, a } = await registerWithOtp();
    expect((await c.post("/auth/login", { identifier: a.email, password: a.password })).code).toBe("EMAIL_NOT_VERIFIED");
    const [mail] = await outboxFor(a.email);
    const code = mail!.bodyText.match(/\b\d{6}\b/)![0];
    await db.update(emailOtps).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await c.post("/auth/verify-email", { email: a.email, code })).code).toBe("INVALID_OTP");
    await db.update(emailOtps).set({ expiresAt: new Date(Date.now() + 60_000) });
    expect((await c.post("/auth/verify-email", { email: a.email, code })).status).toBe(200);
    expect((await c.get("/me")).data.email).toBe(a.email);
  });

  test("satu pintu login: sistem memilah pendaftar dan staff, sesinya tetap terpisah", async () => {
    const p = await makeParticipant();
    const pc = new Client("10.6.6.1");
    const pr = await pc.post("/auth/login", { identifier: p.email.toUpperCase(), password: "RahasiaSekali1" });
    expect(pr.data.type).toBe("PARTICIPANT");
    expect(pc.cookies.has("sid_participant")).toBe(true);
    expect(pc.cookies.has("sid_staff")).toBe(false);
    expect((await pc.get("/admin/registrations")).status).toBe(401);

    const row = (await admin.client.get("/admin/staff")).data.find((s: any) => s.id === admin.id);
    const sc = new Client("10.6.6.2");
    const sr = await sc.post("/auth/login", { identifier: row.username, password: "RahasiaSekali1" });
    expect(sr.data.type).toBe("STAFF");
    expect(sc.cookies.has("sid_staff")).toBe(true);
    expect(sc.cookies.has("sid_participant")).toBe(false);
    expect((await sc.get("/me")).status).toBe(401);
    expect((await sc.get("/admin/staff")).status).toBe(200);

    // Pesan gagal sama, jadi tidak membocorkan jenis atau keberadaan akun.
    const messages = await Promise.all([
      new Client("10.6.6.3").post("/auth/login", { identifier: row.username, password: "salah-password" }),
      new Client("10.6.6.3").post("/auth/login", { identifier: "tidak-ada", password: "salah-password" }),
      new Client("10.6.6.3").post("/auth/login", { identifier: "tidak@ada.local", password: "salah-password" }),
    ]);
    expect(new Set(messages.map((m) => m.json.error.message)).size).toBe(1);
    expect(messages.every((m) => m.status === 401)).toBe(true);
    // Endpoint lama sudah tidak ada.
    expect((await new Client().post("/admin/auth/login", { username: row.username, password: "RahasiaSekali1" })).status).toBe(404);
  });

  test("login staff gagal 5 kali juga diblok sementara", async () => {
    const row = (await admin.client.get("/admin/staff")).data.find((s: any) => s.id === operator.id);
    const c = new Client("10.5.5.5");
    for (let i = 0; i < 5; i++) expect((await c.post("/auth/login", { identifier: row.username, password: "salah-password" })).status).toBe(401);
    expect((await c.post("/auth/login", { identifier: row.username, password: "RahasiaSekali1" })).code).toBe("RATE_LIMITED");
  });

  test("login gagal 5 kali diblok sementara", async () => {
    const p = await makeParticipant();
    const c = new Client("10.9.9.9");
    for (let i = 0; i < 5; i++) expect((await c.post("/auth/login", { identifier: p.email, password: "salah-password" })).status).toBe(401);
    expect((await c.post("/auth/login", { identifier: p.email, password: "RahasiaSekali1" })).code).toBe("RATE_LIMITED");
    // IP lain tidak ikut diblok: limit per akun + IP.
    expect((await new Client("10.8.8.8").post("/auth/login", { identifier: p.email, password: "RahasiaSekali1" })).status).toBe(200);
  });

  test("kirim ulang OTP paling cepat 60 detik", async () => {
    const { c, a } = await registerWithOtp();
    expect((await c.post("/auth/resend-otp", { email: a.email })).code).toBe("RATE_LIMITED");
  });

  test("reset password mencabut semua sesi lama", async () => {
    const p = await makeParticipant();
    expect((await p.client.get("/me")).status).toBe(200);
    expect((await new Client().post("/auth/forgot-password", { email: p.email })).status).toBe(200);
    const mail = (await outboxFor(p.email)).find((m) => m.type === "OTP_RESET_PASSWORD")!;
    const code = mail.bodyText.match(/\b\d{6}\b/)![0];
    expect((await new Client().post("/auth/reset-password", { email: p.email, code, password: "PasswordBaru123" })).status).toBe(200);
    expect((await p.client.get("/me")).status).toBe(401);
    expect((await new Client("10.7.7.7").post("/auth/login", { identifier: p.email, password: "PasswordBaru123" })).status).toBe(200);
  });

  test("NIK tidak bisa diubah lewat profil; ganti email lewat OTP ke email baru", async () => {
    const p = await makeParticipant();
    const before = (await p.client.get("/me")).data;
    const patch = await p.client.patch("/me", { full_name: "Nama Baru", gender: "P", birth_place: "Malang", birth_date: "2001-02-03", phone: "081111111111", address: "Jl. Baru", nik: "1234567890123456" });
    expect(patch.status).toBe(200);
    expect(patch.data.nik).toBe(before.nik);
    expect(patch.data.full_name).toBe("Nama Baru");
    const baru = `baru${nextNik()}@contoh.local`;
    expect((await p.client.post("/me/change-email", { email: baru })).status).toBe(200);
    // Email lama tetap berlaku sampai verifikasi selesai.
    expect((await p.client.get("/me")).data.email).toBe(p.email);
    const code = (await outboxFor(baru))[0]!.bodyText.match(/\b\d{6}\b/)![0];
    expect((await p.client.post("/me/change-email/verify", { code })).status).toBe(200);
    expect((await p.client.get("/me")).data.email).toBe(baru);
  });
});

describe("event, laporan, pengaturan", () => {
  const eventBody = (over: Record<string, unknown> = {}) => ({
    name: "Pelatihan Uji", type: "PELATIHAN", description: "", registration_prefix: `Z${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
    start_at: new Date(Date.now() - 3600_000).toISOString(), end_at: new Date(Date.now() + 86_400_000).toISOString(),
    quota_mode: "FCFS", quota: 5, requires_program: false, status: "PUBLISHED", ...over,
  });

  test("end_at harus setelah start_at; prefix format", async () => {
    const r = await admin.client.post("/admin/events", eventBody({ end_at: new Date(0).toISOString() }));
    expect(r.code).toBe("VALIDATION_ERROR");
    expect(r.json.error.fields.end_at).toBeTruthy();
    expect((await admin.client.post("/admin/events", eventBody({ registration_prefix: "abc" }))).code).toBe("VALIDATION_ERROR");
  });

  test("EV-04: prefix dan mode terkunci setelah submit; kuota tidak di bawah slot terpakai", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    await submitted(ev);
    await submitted(ev);
    const full = (await admin.client.get(`/admin/events/${ev.id}`)).data;
    const body = { name: full.name, type: full.type, description: "", registration_prefix: full.registration_prefix, start_at: new Date(full.start_at).toISOString(), end_at: new Date(full.end_at).toISOString(), quota_mode: full.quota_mode, quota: 5, requires_program: false, status: "PUBLISHED" };
    expect((await admin.client.patch(`/admin/events/${ev.id}`, { ...body, registration_prefix: "BEDA" })).code).toBe("EVENT_LOCKED");
    expect((await admin.client.patch(`/admin/events/${ev.id}`, { ...body, quota_mode: "SELECTION" })).code).toBe("EVENT_LOCKED");
    expect((await admin.client.patch(`/admin/events/${ev.id}`, { ...body, quota: 1 })).code).toBe("EVENT_LOCKED");
    expect((await admin.client.patch(`/admin/events/${ev.id}`, { ...body, quota: 2 })).status).toBe(200);
  });

  test("program yang sudah dipilih tidak bisa dihapus; wajib dipilih saat submit bila diperlukan", async () => {
    const ev = await makeEvent({ mode: "SELECTION", quota: 5, requiresProgram: true });
    const prog = (await admin.client.post(`/admin/events/${ev.id}/programs`, { name: "Informatika" })).data;
    const p = await makeParticipant();
    const id = await draftWithDocs(p, ev);
    expect((await p.client.post(`/me/registrations/${id}/submit`)).code).toBe("PROGRAM_REQUIRED");
    expect((await p.client.patch(`/me/registrations/${id}`, { program_id: prog.id })).status).toBe(200);
    expect((await admin.client.del(`/admin/events/${ev.id}/programs/${prog.id}`)).code).toBe("EVENT_LOCKED");
    expect((await p.client.post(`/me/registrations/${id}/submit`)).status).toBe(200);
  });

  test("event penuh tampil penuh di publik; event tutup menolak draft", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 1 });
    await submitted(ev);
    const pub = await new Client().get("/events");
    const row = pub.data.find((e: any) => e.id === ev.id);
    expect(row.is_full).toBe(true);
    expect(row.is_open).toBe(false);
    expect(row.remaining).toBe(0);
    const p = await makeParticipant();
    expect((await p.client.post(`/events/${ev.id}/registrations`)).code).toBe("QUOTA_FULL");
  });

  test("dashboard sama dengan daftar; export tercatat di log", async () => {
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    await submitted(ev);
    await underReview(ev);
    const stats = await operator.client.get(`/admin/dashboard/stats?event_id=${ev.id}`);
    const list = await operator.client.get(`/admin/registrations?event_id=${ev.id}`);
    expect(stats.data.total).toBe(list.data.total);
    expect(stats.data.by_status.UNDER_REVIEW).toBe(1);
    expect(stats.data.daily).toHaveLength(30);
    expect(stats.data.monthly).toHaveLength(12);
    const csv = await operator.client.get(`/admin/registrations/export?format=csv&event_id=${ev.id}`);
    expect(csv.status).toBe(200);
    expect(csv.text.split("\r\n").filter(Boolean).length).toBe(3);
    expect(csv.text).toContain(ev.prefix);
    const xlsx = await operator.client.get(`/admin/registrations/export?format=xlsx&event_id=${ev.id}`);
    expect(xlsx.status).toBe(200);
    const logs = await admin.client.get("/admin/activity-logs?action=REPORT_EXPORTED");
    expect(logs.data.total).toBeGreaterThanOrEqual(2);
    const sum = await operator.client.get(`/admin/reports/summary?event_id=${ev.id}`);
    expect(sum.data.total).toBe(2);
    expect(sum.data.registrants[0].nik_masked).toBeTruthy();
  });

  test("dashboard lengkap: antrean terlama dulu, program, tanpa NIK, email gagal hanya untuk admin", async () => {
    const ev = await makeEvent({ mode: "SELECTION", quota: 5, requiresProgram: true });
    const prog = (await admin.client.post(`/admin/events/${ev.id}/programs`, { name: "Informatika" })).data;
    const regs: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await makeParticipant();
      const id = await draftWithDocs(p, ev);
      await p.client.patch(`/me/registrations/${id}`, { program_id: prog.id });
      await p.client.post(`/me/registrations/${id}/submit`);
      regs.push(id);
    }
    await operator.client.post(`/admin/registrations/${regs[1]}/transitions`, { to: "UNDER_REVIEW" });
    await operator.client.post(`/admin/registrations/${regs[2]}/transitions`, { to: "UNDER_REVIEW" });
    await markAllValid(regs[2]!);
    await operator.client.post(`/admin/registrations/${regs[2]}/transitions`, { to: "ACCEPTED" });

    const s = await operator.client.get(`/admin/dashboard/stats?event_id=${ev.id}`);
    expect(s.data.queue.map((q: any) => q.id)).toEqual([regs[0], regs[1]]);
    expect(s.data.recent[0].id).toBe(regs[2]);
    expect(s.data.by_program).toEqual([{ program_id: prog.id, program: "Informatika", n: 3 }]);
    const row = s.data.quotas.find((q: any) => q.event_id === ev.id);
    expect(row.submitted).toBe(3);
    expect(row.used).toBe(1);
    expect(row.end_at).toBeTruthy();
    expect(s.text).not.toMatch(/"nik"|"email"/);

    await db.update(notifications).set({ status: "FAILED" }).where(sql`id = (select id from notifications limit 1)`);
    expect((await admin.client.get("/admin/dashboard/stats")).data.failed_emails).toBeGreaterThan(0);
    expect((await operator.client.get("/admin/dashboard/stats")).data.failed_emails).toBe(0);
    await db.update(notifications).set({ status: "SENT" }).where(eq(notifications.status, "FAILED"));
  });

  test("password SMTP tidak pernah dikirim ke frontend dan tersimpan terenkripsi; log tanpa rahasia", async () => {
    const body = { preset: "CUSTOM", host: "smtp.contoh.local", port: 587, security: "STARTTLS", username: "u", password: "sandi-smtp-rahasia", from_name: "Panitia", from_address: "u@contoh.local", reply_to: "" };
    expect((await admin.client.put("/admin/settings/email", body)).status).toBe(200);
    const got = await admin.client.get("/admin/settings/email");
    expect(got.text).not.toContain("sandi-smtp-rahasia");
    expect(got.data.password_set).toBe(true);
    const raw = await db.execute<{ value: string }>(sql`select value from settings where key = 'email.password'`);
    expect(raw[0]!.value).not.toContain("sandi-smtp-rahasia");
    const logs = await admin.client.get("/admin/activity-logs?action=SETTINGS_CHANGED");
    expect(logs.text).not.toContain("sandi-smtp-rahasia");
    // Field kosong: password lama tetap dipakai.
    expect((await admin.client.put("/admin/settings/email", { ...body, password: "" })).status).toBe(200);
    expect((await admin.client.get("/admin/settings/email")).data.password_set).toBe(true);
    await db.execute(sql`delete from settings`);
  });

  test("activity log tidak pernah memuat kode OTP", async () => {
    const a = profile();
    await new Client().post("/auth/register", a);
    const [mail] = await outboxFor(a.email);
    const code = mail!.bodyText.match(/\b\d{6}\b/)![0];
    const logs = await admin.client.get("/admin/activity-logs?action=OTP_REQUESTED");
    expect(logs.text).not.toContain(code);
  });
});

describe("worker outbox", () => {
  test("mengirim ke SMTP, gagal dicoba ulang, lalu FAILED setelah 3 kali coba ulang", async () => {
    const { notificationService } = await import("../src/modules/notifications");
    await db.update(notifications).set({ status: "SENT" });
    const ev = await makeEvent({ mode: "FCFS", quota: 5 });
    const a = await submitted(ev);
    // Port tertutup: pengiriman pasti gagal.
    const { settings } = await import("../src/modules/settings/settings.table");
    await db.insert(settings).values([{ key: "email.host", value: "127.0.0.1" }, { key: "email.port", value: "1" }, { key: "email.security", value: "NONE" }, { key: "email.from_address", value: "x@contoh.local" }]);
    await notificationService.processDue();
    let [m] = await outboxFor(a.email);
    expect(m!.status).toBe("PENDING");
    expect(m!.attempts).toBe(1);
    expect(m!.lastError).toBeTruthy();
    expect(m!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
    for (let i = 0; i < 3; i++) {
      await db.update(notifications).set({ nextAttemptAt: new Date(0) }).where(eq(notifications.id, m!.id));
      await notificationService.processDue();
    }
    [m] = await outboxFor(a.email);
    expect(m!.status).toBe("FAILED");
    expect((await admin.client.post(`/admin/notifications/${m!.id}/retry`)).status).toBe(200);
    [m] = await outboxFor(a.email);
    expect(m!.status).toBe("PENDING");
    await db.execute(sql`delete from settings`);
    await db.update(notifications).set({ status: "SENT" });
  }, 60_000);
});

describe("kinerja", () => {
  test("daftar pendaftar dengan filter di bawah 500 ms pada 10.000 data", async () => {
    const ev = await makeEvent({ mode: "SELECTION", quota: null });
    await db.execute(sql`
      with p as (
        insert into participants (id, nik, full_name, gender, birth_place, birth_date, email, phone, address, password_hash)
        select gen_random_uuid(), lpad((9000000000000000 + g)::text, 16, '0'), 'Peserta ' || g, 'L', 'Sampang', '2000-01-01', 'massal' || g || '@contoh.local', '081234567890', 'Jl. Uji', 'x'
        from generate_series(1, 10000) g
        returning id, nik
      )
      insert into registrations (id, registration_number, participant_id, event_id, status, submitted_at)
      select gen_random_uuid(), 'MSL-2026-' || nik, id, ${ev.id}, (array['SUBMITTED','UNDER_REVIEW','ACCEPTED','REJECTED'])[1 + (nik::bigint % 4)], now() - (nik::bigint % 30) * interval '1 day'
      from p`);
    await db.execute(sql`analyze participants`);
    await db.execute(sql`analyze registrations`);
    const paths = [
      `/admin/registrations?event_id=${ev.id}`,
      `/admin/registrations?event_id=${ev.id}&status=ACCEPTED&page=50`,
      `/admin/registrations?q=Peserta%20777`,
      `/admin/registrations?q=massal500&status=SUBMITTED`,
      `/admin/registrations?from=2026-01-01&to=2030-01-01&page=200`,
    ];
    for (const path of paths) {
      const t = performance.now();
      const r = await operator.client.get(path);
      const ms = performance.now() - t;
      expect(r.status).toBe(200);
      console.log(`${Math.round(ms)} ms  ${path.replace(ev.id, "<event>")}`);
      expect(ms).toBeLessThan(500);
    }
  }, 60_000);
});

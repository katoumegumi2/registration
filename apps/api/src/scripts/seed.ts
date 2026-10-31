// Seed PRD 12: 1 admin, 1 operator, 2 event (seleksi + FCFS), 6 jenis dokumen, minimal 20 pendaftar dummy dengan status beragam.
// Aman dijalankan ulang: bila admin sudah ada, seed berhenti tanpa menyentuh data.
import { eq } from "drizzle-orm";
import type { RegistrationStatus, VerificationStatus } from "@pendaftaran/shared";
import { db, newId, pg } from "../shared/db/client";
import { storage } from "../shared/storage";
import { documents } from "../modules/documents/documents.table";
import { documentTypes, eventDocumentRequirements, eventPrograms, events } from "../modules/events/events.table";
import { participants } from "../modules/participants/participants.table";
import { registrations, registrationStatusHistory } from "../modules/registrations/registrations.table";
import { staffUsers } from "../modules/staff/staff.table";

const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!adminPassword || adminPassword.length < 8) throw new Error("SEED_ADMIN_PASSWORD wajib diisi, minimal 8 karakter");

const [already] = await db.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.username, "admin"));
if (already) {
  console.log("Seed sudah pernah dijalankan, dilewati.");
  await pg.end();
  process.exit(0);
}

const hash = (p: string) => Bun.password.hash(p, "argon2id");
const adminId = newId();
const operatorId = newId();
await db.insert(staffUsers).values([
  { id: adminId, username: "admin", fullName: "Administrator", email: "admin@pendaftaran.local", role: "ADMIN", passwordHash: await hash(adminPassword) },
  { id: operatorId, username: "operator", fullName: "Operator Verifikasi", email: "operator@pendaftaran.local", role: "OPERATOR", passwordHash: await hash(adminPassword) },
]);

const typeNames = ["KTP", "Ijazah", "Pas Foto", "Kartu Keluarga", "Surat Persetujuan Desa", "Transkrip Nilai"];
const types = Object.fromEntries(typeNames.map((n) => [n, newId()])) as Record<string, string>;
await db.insert(documentTypes).values(typeNames.map((name) => ({ id: types[name]!, name })));

const DAY = 86_400_000;
const now = Date.now();
const pmbId = newId();
const semId = newId();
await db.insert(events).values([
  {
    id: pmbId, name: "Penerimaan Mahasiswa Baru 2027", slug: "pmb-2027", type: "PMB", registrationPrefix: "PMB",
    description: "Seleksi penerimaan mahasiswa baru tahun akademik 2027. Pendaftar yang lolos verifikasi berkas akan diseleksi sesuai kuota.",
    startAt: new Date(now - 30 * DAY), endAt: new Date(now + 60 * DAY), quotaMode: "SELECTION", quota: 5, requiresProgram: true, status: "PUBLISHED", createdBy: adminId,
  },
  {
    id: semId, name: "Seminar Transformasi Digital Desa", slug: "seminar-digital-desa", type: "SEMINAR", registrationPrefix: "SEM",
    description: "Seminar satu hari dengan kapasitas terbatas. Siapa cepat dia dapat.",
    startAt: new Date(now - 20 * DAY), endAt: new Date(now + 30 * DAY), quotaMode: "FCFS", quota: 9, requiresProgram: false, status: "PUBLISHED", createdBy: adminId,
  },
]);

const prodi = ["Teknik Informatika", "Sistem Informasi", "Manajemen", "Pendidikan Guru SD"].map((name) => ({ id: newId(), eventId: pmbId, name }));
await db.insert(eventPrograms).values(prodi);
await db.insert(eventDocumentRequirements).values([
  { eventId: pmbId, documentTypeId: types["KTP"]!, isRequired: true },
  { eventId: pmbId, documentTypeId: types["Ijazah"]!, isRequired: true },
  { eventId: pmbId, documentTypeId: types["Pas Foto"]!, isRequired: true },
  { eventId: pmbId, documentTypeId: types["Transkrip Nilai"]!, isRequired: false },
  { eventId: semId, documentTypeId: types["KTP"]!, isRequired: true },
]);

// PDF kecil yang sah, supaya pratinjau di panel admin berfungsi.
const samplePdf = (title: string) =>
  new TextEncoder().encode(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${title.length + 34}>>stream
BT /F1 16 Tf 30 100 Td (${title}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF`);

const names = ["Ahmad Fauzi", "Siti Aminah", "Budi Santoso", "Dewi Lestari", "Rizky Pratama", "Nur Hidayah", "Agus Salim", "Rina Wulandari", "Hendra Gunawan", "Fitri Handayani", "Yusuf Maulana", "Intan Permata", "Dimas Saputra", "Lina Marlina", "Fajar Nugroho", "Maya Sari", "Irfan Hakim", "Putri Ayu", "Bayu Setiawan", "Ani Rahmawati", "Wahyu Hidayat", "Sri Mulyani", "Eko Prasetyo", "Tari Kusuma"];

// Rangkaian status yang dilalui, supaya riwayat status di detail terlihat utuh.
const PATHS: Record<RegistrationStatus, RegistrationStatus[]> = {
  DRAFT: [],
  SUBMITTED: ["SUBMITTED"],
  UNDER_REVIEW: ["SUBMITTED", "UNDER_REVIEW"],
  ACCEPTED: ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED"],
  REJECTED: ["SUBMITTED", "UNDER_REVIEW", "REJECTED"],
  WAITING_LIST: ["SUBMITTED", "UNDER_REVIEW", "WAITING_LIST"],
};

const pmbPlan: RegistrationStatus[] = ["ACCEPTED", "ACCEPTED", "ACCEPTED", "ACCEPTED", "WAITING_LIST", "WAITING_LIST", "REJECTED", "REJECTED", "UNDER_REVIEW", "UNDER_REVIEW", "SUBMITTED", "SUBMITTED", "SUBMITTED", "DRAFT"];
const semPlan: RegistrationStatus[] = ["ACCEPTED", "ACCEPTED", "ACCEPTED", "UNDER_REVIEW", "UNDER_REVIEW", "SUBMITTED", "SUBMITTED", "SUBMITTED", "REJECTED", "DRAFT"];

const dummyPassword = await hash("Pendaftar123");
const participantIds = names.map(() => newId());
await db.insert(participants).values(
  names.map((fullName, i) => ({
    id: participantIds[i]!,
    nik: `3527${String(100000000000 + i * 7919).slice(0, 12)}`,
    fullName,
    gender: i % 2 ? "P" : "L",
    birthPlace: ["Sampang", "Surabaya", "Malang", "Pamekasan"][i % 4]!,
    birthDate: `${1998 + (i % 7)}-0${(i % 9) + 1}-1${i % 9}`,
    email: `pendaftar${i + 1}@contoh.local`,
    phone: `0812345${String(10000 + i)}`,
    address: `Jl. Merdeka No. ${i + 1}, Sampang`,
    institution: i % 3 ? "SMA Negeri 1 Sampang" : "MA Al-Ikhlas",
    educationLevel: "SMA",
    passwordHash: dummyPassword,
    emailVerifiedAt: new Date(now - 25 * DAY),
  })),
);

async function seedRegistration(opts: { participantId: string; eventId: string; prefix: string; seq: number; status: RegistrationStatus; programId: string | null; requirementIds: string[]; daysAgo: number }) {
  const id = newId();
  const submittedAt = new Date(now - opts.daysAgo * DAY);
  const path = PATHS[opts.status];
  const reviewed = opts.status === "ACCEPTED" || opts.status === "REJECTED" || opts.status === "WAITING_LIST";
  const notes = opts.status === "REJECTED" ? "Berkas tidak memenuhi syarat." : null;
  await db.insert(registrations).values({
    id, participantId: opts.participantId, eventId: opts.eventId, programId: opts.programId, status: opts.status,
    registrationNumber: opts.status === "DRAFT" ? null : `${opts.prefix}-2026-${String(opts.seq).padStart(4, "0")}`,
    submittedAt: opts.status === "DRAFT" ? null : submittedAt,
    verificationNotes: notes, verifiedBy: reviewed ? operatorId : null, verifiedAt: reviewed ? new Date(submittedAt.getTime() + DAY) : null,
  });
  let prev: RegistrationStatus = "DRAFT";
  let at = submittedAt.getTime();
  for (const to of path) {
    await db.insert(registrationStatusHistory).values({ id: newId(), registrationId: id, fromStatus: prev, toStatus: to, notes: to === "REJECTED" ? notes : null, changedBy: to === "SUBMITTED" ? null : operatorId, changedAt: new Date(at) });
    prev = to;
    at += 6 * 3600_000;
  }
  if (opts.status === "DRAFT") return;
  const verification: VerificationStatus = opts.status === "ACCEPTED" || opts.status === "WAITING_LIST" ? "VALID" : opts.status === "REJECTED" ? "INVALID" : "PENDING";
  for (const typeId of opts.requirementIds) {
    const docId = newId();
    const key = `registrations/${id}/${docId}/${newId()}.pdf`;
    const bytes = samplePdf("Contoh berkas pendaftaran");
    await storage.write(key, bytes, "application/pdf");
    await db.insert(documents).values({
      id: docId, registrationId: id, documentTypeId: typeId, objectKey: key, originalName: "contoh-berkas.pdf", mimeType: "application/pdf", sizeBytes: bytes.byteLength,
      verificationStatus: verification, notes: verification === "INVALID" ? "Berkas tidak terbaca." : null, uploadedAt: submittedAt,
      verifiedBy: verification === "PENDING" ? null : operatorId, verifiedAt: verification === "PENDING" ? null : new Date(submittedAt.getTime() + DAY),
    });
  }
}

const pmbReq = [types["KTP"]!, types["Ijazah"]!, types["Pas Foto"]!];
let seq = 0;
for (const [i, status] of pmbPlan.entries()) {
  if (status !== "DRAFT") seq++;
  await seedRegistration({ participantId: participantIds[i]!, eventId: pmbId, prefix: "PMB", seq, status, programId: prodi[i % prodi.length]!.id, requirementIds: pmbReq, daysAgo: 28 - i * 2 });
}
await db.update(events).set({ lastSeq: seq }).where(eq(events.id, pmbId));

seq = 0;
for (const [i, status] of semPlan.entries()) {
  if (status !== "DRAFT") seq++;
  // Akun yang sama boleh ikut dua event: 6 pendaftar pertama seminar juga pendaftar PMB.
  await seedRegistration({ participantId: participantIds[i < 6 ? i : i + 8]!, eventId: semId, prefix: "SEM", seq, status, programId: null, requirementIds: [types["KTP"]!], daysAgo: 18 - i * 2 });
}
await db.update(events).set({ lastSeq: seq }).where(eq(events.id, semId));

console.log(`Seed selesai: 2 staff, 2 event, ${typeNames.length} jenis dokumen, ${names.length} pendaftar.`);
await pg.end();

import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { findTransition, statusUsesSlot, type QuotaMode, type RegistrationStatus } from "@pendaftaran/shared";
import { db, newId, type DbOrTx, type Tx } from "../../shared/db/client";
import { emit, type EventMeta, type RegistrationMailData } from "../../shared/events/bus";
import { ApiError, invalidTransition, notFound } from "../../shared/http/errors";
import { storage } from "../../shared/storage";
import { documentService, type RegistrationContext } from "../documents";
import { eventService, type EventRow, type EventUsage } from "../events";
import { participantService } from "../participants";
import { registrations, registrationStatusHistory } from "./registrations.table";

export type RegistrationRow = typeof registrations.$inferSelect;

export const getById = async (id: string, conn: DbOrTx = db) => (await conn.select().from(registrations).where(eq(registrations.id, id)))[0] ?? null;

/** Kunci per pendaftaran (PRD 6.7). Pemanggil yang menyentuh kuota sudah mengunci event lebih dulu. */
export async function lock(tx: Tx, id: string): Promise<RegistrationRow> {
  const [row] = await tx.select().from(registrations).where(eq(registrations.id, id)).for("update");
  if (!row) throw notFound("Pendaftaran");
  return row;
}

export const contextOf = (r: RegistrationRow): RegistrationContext => ({ registrationId: r.id, eventId: r.eventId, status: r.status });

export async function mailData(r: RegistrationRow, conn: DbOrTx = db): Promise<RegistrationMailData> {
  const [p, e, prog] = await Promise.all([
    participantService.getById(r.participantId, conn),
    eventService.getById(r.eventId, conn),
    r.programId ? eventService.getProgram(r.programId, conn) : null,
  ]);
  return { registrationId: r.id, participantId: r.participantId, number: r.registrationNumber, name: p!.fullName, email: p!.email, eventName: e!.name, programName: prog?.name ?? null };
}

// ---------- Kuota ----------
export async function slotsUsed(eventId: string, mode: QuotaMode, conn: DbOrTx = db): Promise<number> {
  const rows = await conn.select({ status: registrations.status, n: sql<number>`count(*)::int` }).from(registrations).where(eq(registrations.eventId, eventId)).groupBy(registrations.status);
  return rows.filter((r) => statusUsesSlot(r.status, mode)).reduce((a, r) => a + r.n, 0);
}

export function assertQuota(e: EventRow, used: number) {
  if (e.quota !== null && used >= e.quota) throw new ApiError(409, "QUOTA_FULL", e.quotaMode === "FCFS" ? "Kuota penuh" : "Kuota diterima sudah penuh");
}

export async function eventUsage(tx: Tx, e: EventRow): Promise<EventUsage> {
  const [submitted] = await tx.select({ n: sql<number>`count(*)::int` }).from(registrations).where(and(eq(registrations.eventId, e.id), ne(registrations.status, "DRAFT")));
  const programs = await tx.selectDistinct({ id: registrations.programId }).from(registrations).where(and(eq(registrations.eventId, e.id), isNotNull(registrations.programId)));
  return { hasSubmitted: submitted!.n > 0, slotsUsed: await slotsUsed(e.id, e.quotaMode, tx), programIdsUsed: programs.map((p) => p.id!) };
}

/** Status buka untuk publik (PE-01): status, periode, dan slot FCFS. */
export async function publicEventView(e: EventRow) {
  const used = await slotsUsed(e.id, e.quotaMode);
  const remaining = e.quota === null ? null : Math.max(0, e.quota - used);
  const full = e.quotaMode === "FCFS" && remaining === 0;
  return {
    id: e.id, name: e.name, slug: e.slug, type: e.type, description: e.description, start_at: e.startAt, end_at: e.endAt,
    quota_mode: e.quotaMode, quota: e.quota, requires_program: e.requiresProgram,
    is_open: eventService.isWithinPeriod(e) && !full,
    is_full: full,
    // Sisa kuota hanya untuk FCFS; mode seleksi tampil berlabel "Seleksi" (PE-01).
    remaining: e.quotaMode === "FCFS" ? remaining : null,
  };
}

// ---------- Satu pintu perubahan status (PRD aturan 5) ----------
export async function changeStatus(tx: Tx, r: RegistrationRow, to: RegistrationStatus, opts: { notes?: string | null; staffId?: string | null; meta: EventMeta; set?: Partial<typeof registrations.$inferInsert> }): Promise<RegistrationRow> {
  if (!findTransition(r.status, to)) throw invalidTransition();
  const notes = opts.notes?.trim() || null;
  const reviewFields = opts.staffId ? { verificationNotes: notes, verifiedBy: opts.staffId, verifiedAt: new Date() } : {};
  const [updated] = await tx.update(registrations).set({ status: to, updatedAt: new Date(), ...reviewFields, ...opts.set }).where(eq(registrations.id, r.id)).returning();
  await tx.insert(registrationStatusHistory).values({ id: newId(), registrationId: r.id, fromStatus: r.status, toStatus: to, notes, changedBy: opts.staffId ?? null });
  const mail = await mailData(updated!, tx);
  await emit(tx, "registration.status_changed", { ...mail, from: r.status, to, notes }, opts.meta);
  return updated!;
}

// ---------- Pendaftar ----------
/** PE-03: pendaftaran yang sudah ada dikembalikan, bukan dibuat ulang. */
export async function createDraft(participantId: string, eventId: string, meta: EventMeta) {
  const p = await participantService.getById(participantId);
  if (!p?.emailVerifiedAt) throw new ApiError(403, "EMAIL_NOT_VERIFIED", "Email belum diverifikasi");
  const existing = await findMine(participantId, eventId);
  if (existing) return { registration: existing, existing: true };
  const e = await eventService.getById(eventId);
  if (!e || e.status === "DRAFT") throw notFound("Event");
  if (!eventService.isWithinPeriod(e)) throw new ApiError(409, "EVENT_CLOSED", "Pendaftaran event ini sedang tidak dibuka");
  const view = await publicEventView(e);
  if (view.is_full) throw new ApiError(409, "QUOTA_FULL", "Kuota penuh");
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(registrations).values({ id: newId(), participantId, eventId }).onConflictDoNothing().returning();
    if (!row) return { registration: (await findMine(participantId, eventId, tx))!, existing: true };
    await emit(tx, "activity", { action: "REGISTRATION_DRAFTED", entityType: "registration", entityId: row.id, registrationId: row.id, description: `Draft pendaftaran ${e.name} dibuat` }, meta);
    return { registration: row, existing: false };
  });
}

async function findMine(participantId: string, eventId: string, conn: DbOrTx = db) {
  return (await conn.select().from(registrations).where(and(eq(registrations.participantId, participantId), eq(registrations.eventId, eventId))))[0] ?? null;
}

/** Milik orang lain dijawab 404, bukan 403 (PRD 3). */
export async function getOwned(participantId: string, id: string, conn: DbOrTx = db) {
  const r = await getById(id, conn);
  if (!r || r.participantId !== participantId) throw notFound("Pendaftaran");
  return r;
}

export async function historyOf(id: string, conn: DbOrTx = db) {
  const rows = await conn.select().from(registrationStatusHistory).where(eq(registrationStatusHistory.registrationId, id)).orderBy(asc(registrationStatusHistory.changedAt));
  return rows.map((h) => ({ id: h.id, from_status: h.fromStatus, to_status: h.toStatus, notes: h.notes, changed_by: h.changedBy, changed_at: h.changedAt }));
}

export async function view(r: RegistrationRow) {
  const [e, prog, docs, history, reqs, programs] = await Promise.all([
    eventService.getById(r.eventId),
    r.programId ? eventService.getProgram(r.programId) : null,
    documentService.listFor(r.id).then((rows) => documentService.withNames(rows)),
    historyOf(r.id),
    eventService.listRequirements(r.eventId),
    eventService.listPrograms(r.eventId),
  ]);
  return {
    id: r.id, registration_number: r.registrationNumber, status: r.status, submitted_at: r.submittedAt, verification_notes: r.verificationNotes,
    verified_at: r.verifiedAt, created_at: r.createdAt, updated_at: r.updatedAt, participant_id: r.participantId, program_id: r.programId,
    program_name: prog?.name ?? null,
    event: { id: e!.id, name: e!.name, slug: e!.slug, type: e!.type, start_at: e!.startAt, end_at: e!.endAt, quota_mode: e!.quotaMode, requires_program: e!.requiresProgram, is_period_open: eventService.isWithinPeriod(e!) },
    programs: programs.filter((p) => p.isActive || p.id === r.programId).map((p) => ({ id: p.id, name: p.name })),
    requirements: reqs,
    documents: docs,
    history,
  };
}

export async function listMine(participantId: string) {
  const rows = await db.select().from(registrations).where(eq(registrations.participantId, participantId)).orderBy(desc(registrations.createdAt));
  return Promise.all(rows.map(view));
}

export async function setProgram(participantId: string, id: string, programId: string | null, meta: EventMeta) {
  return db.transaction(async (tx) => {
    const r = await lock(tx, id);
    if (r.participantId !== participantId) throw notFound("Pendaftaran");
    if (r.status !== "DRAFT") throw invalidTransition("Program hanya bisa dipilih selama draft");
    await assertProgram(tx, r.eventId, programId, true);
    const [row] = await tx.update(registrations).set({ programId, updatedAt: new Date() }).where(eq(registrations.id, id)).returning();
    await emit(tx, "activity", { action: "PROGRAM_SELECTED", entityType: "registration", entityId: id, registrationId: id, description: "Program dipilih" }, meta);
    return row!;
  });
}

/** Pindah program dilakukan admin (PRD 6.4). */
export async function adminSetProgram(tx: Tx, id: string, programId: string, meta: EventMeta) {
  const r = await lock(tx, id);
  await assertProgram(tx, r.eventId, programId, true);
  await tx.update(registrations).set({ programId, updatedAt: new Date() }).where(eq(registrations.id, id));
  await emit(tx, "activity", { action: "PROGRAM_CHANGED_BY_ADMIN", entityType: "registration", entityId: id, registrationId: id, description: "Program dipindahkan admin", metadata: { from: r.programId, to: programId } }, meta);
}

async function assertProgram(tx: Tx, eventId: string, programId: string | null, mustBeActive: boolean) {
  if (!programId) return;
  const prog = await eventService.getProgram(programId, tx);
  if (!prog || prog.eventId !== eventId || (mustBeActive && !prog.isActive)) throw new ApiError(422, "VALIDATION_ERROR", "Program tidak valid untuk event ini", { program_id: "Program tidak valid" });
}

export function formatNumber(prefix: string, seq: number, at: Date) {
  const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Jakarta" }).format(at);
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

/** Submit dalam satu transaksi: kunci event + kunci pendaftaran + dokumen + kuota + nomor + status. */
export async function submit(participantId: string, id: string, meta: EventMeta) {
  const owned = await getOwned(participantId, id);
  return db.transaction(async (tx) => {
    const e = await eventService.lockForQuota(tx, owned.eventId);
    const r = await lock(tx, id);
    if (r.status !== "DRAFT") throw invalidTransition("Pendaftaran ini sudah dikirim");
    if (!eventService.isWithinPeriod(e)) throw new ApiError(409, "EVENT_CLOSED", "Periode pendaftaran event ini sudah berakhir atau belum dibuka");
    if (e.requiresProgram && !r.programId) throw new ApiError(422, "PROGRAM_REQUIRED", "Pilih program terlebih dahulu");
    await documentService.assertRequiredUploaded(tx, e.id, r.id);
    if (e.quotaMode === "FCFS") assertQuota(e, await slotsUsed(e.id, "FCFS", tx));
    const seq = await eventService.nextSeq(tx, e);
    const now = new Date();
    const number = formatNumber(e.registrationPrefix, seq, now);
    const updated = await changeStatus(tx, r, "SUBMITTED", { meta, set: { registrationNumber: number, submittedAt: now } });
    const mail = await mailData(updated, tx);
    await emit(tx, "registration.submitted", { ...mail, submittedAt: now }, meta);
    return updated;
  });
}

/** Konfirmasi unggahan (PRD 6.6): transfer berkas di luar kunci baris; objek lama dihapus setelah commit. */
export async function confirmUpload(participantId: string, id: string, uploadId: string, meta: EventMeta) {
  await getOwned(participantId, id);
  const prepared = await documentService.prepareUpload(id, uploadId);
  try {
    const result = await db.transaction(async (tx) => {
      const r = await lock(tx, id);
      return documentService.commitUpload(tx, contextOf(r), prepared, meta);
    });
    if (result.outcome === "committed") {
      await storage.delete(prepared.tempKey);
      if (result.oldKey) await storage.delete(result.oldKey);
    }
    return { document_id: result.documentId };
  } catch (err) {
    // Status tidak lagi mengizinkan: key final yang baru ditulis dibuang, berkas lama utuh.
    await storage.delete(prepared.finalKey);
    await storage.delete(prepared.tempKey);
    throw err;
  }
}

export async function removeDocument(participantId: string, id: string, documentId: string, meta: EventMeta) {
  const key = await db.transaction(async (tx) => {
    const r = await lock(tx, id);
    if (r.participantId !== participantId) throw notFound("Pendaftaran");
    const k = await documentService.remove(tx, contextOf(r), documentId);
    await emit(tx, "activity", { action: "DOCUMENT_DELETED", entityType: "document", entityId: documentId, registrationId: id, description: "File dihapus saat draft" }, meta);
    return k;
  });
  await storage.delete(key);
}

export async function byIds(ids: string[]) {
  return ids.length ? db.select().from(registrations).where(inArray(registrations.id, ids)) : [];
}

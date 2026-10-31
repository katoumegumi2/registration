import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { canReplaceDocument, canVerifyDocument, detectFileType, MAX_FILE_BYTES, type DetectedFile, type RegistrationStatus, type VerificationStatus } from "@pendaftaran/shared";
import { verifyToken } from "../../shared/crypto";
import { db, newId, type DbOrTx, type Tx } from "../../shared/db/client";
import { emit, type EventMeta, type RegistrationMailData } from "../../shared/events/bus";
import { ApiError, notFound } from "../../shared/http/errors";
import { LocalDriver, storage, TEMP_PREFIX } from "../../shared/storage";
import { eventService } from "../events";
import { documents, uploads } from "./documents.table";

export type DocumentRow = typeof documents.$inferSelect;

/** Konteks dari pemanggil: modul ini tidak memanggil registrations (PRD aturan 3). */
export interface RegistrationContext {
  registrationId: string;
  eventId: string;
  status: RegistrationStatus;
}

const UPLOAD_TTL_MS = 3600_000;

const isAttachment = (mime: string) => !(mime === "application/pdf" || mime.startsWith("image/"));

export const listFor = (registrationId: string, conn: DbOrTx = db) => conn.select().from(documents).where(eq(documents.registrationId, registrationId)).orderBy(asc(documents.documentTypeId));
export const getById = async (id: string, conn: DbOrTx = db) => (await conn.select().from(documents).where(eq(documents.id, id)))[0] ?? null;

export async function withNames(rows: DocumentRow[], conn: DbOrTx = db) {
  const names = await eventService.documentTypeNames([...new Set(rows.map((r) => r.documentTypeId))], conn);
  // Urutan tetap menurut nama: tanpa ini Postgres bisa memindahkan baris setelah UPDATE,
  // sehingga dokumen melompat posisi di layar staff setelah diverifikasi.
  const ordered = [...rows].sort((a, b) => (names.get(a.documentTypeId) ?? "").localeCompare(names.get(b.documentTypeId) ?? ""));
  return ordered.map((d) => ({
    id: d.id, document_type_id: d.documentTypeId, document_type_name: names.get(d.documentTypeId) ?? "", original_name: d.originalName,
    mime_type: d.mimeType, size_bytes: d.sizeBytes, verification_status: d.verificationStatus, notes: d.notes,
    uploaded_at: d.uploadedAt, replaced_at: d.replacedAt, verified_at: d.verifiedAt, attachment_only: isAttachment(d.mimeType),
  }));
}

// ---------- Langkah 1: target unggah ----------
export async function createUpload(ctx: RegistrationContext, documentTypeId: string, originalName: string) {
  const reqs = await eventService.listRequirements(ctx.eventId);
  if (!reqs.some((r) => r.document_type_id === documentTypeId)) throw notFound("Jenis dokumen");
  const [existing] = await db.select().from(documents).where(and(eq(documents.registrationId, ctx.registrationId), eq(documents.documentTypeId, documentTypeId)));
  if (!canReplaceDocument(ctx.status, existing?.verificationStatus ?? null)) throw new ApiError(409, "FILE_LOCKED", "Berkas ini tidak bisa diganti pada status pendaftaran saat ini");
  const id = newId();
  const tempKey = `${TEMP_PREFIX}${id}`;
  await db.insert(uploads).values({ id, registrationId: ctx.registrationId, documentTypeId, tempKey, originalName, expiresAt: new Date(Date.now() + UPLOAD_TTL_MS) });
  return { upload_id: id, ...storage.uploadTarget(id, tempKey) };
}

// ---------- Driver lokal: PUT sekali pakai ----------
export async function receiveLocalUpload(token: string, body: ReadableStream<Uint8Array> | null) {
  const claims = verifyToken<{ kind: string; uploadId: string; exp: number }>(token);
  if (!claims || claims.kind !== "put" || !(storage instanceof LocalDriver)) throw new ApiError(403, "FORBIDDEN", "Tautan unggah tidak berlaku");
  const [claimed] = await db.update(uploads).set({ receivedAt: new Date() }).where(and(eq(uploads.id, claims.uploadId), eq(uploads.status, "PENDING"), isNull(uploads.receivedAt))).returning();
  if (!claimed) throw new ApiError(409, "CONFLICT", "Tautan unggah ini sudah dipakai");
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (body) {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FILE_BYTES) {
        await reader.cancel();
        await rejectUpload(claimed.id, claimed.tempKey);
        throw new ApiError(422, "FILE_REJECTED", "Ukuran file melebihi 5 MB");
      }
      chunks.push(value);
    }
  }
  await storage.write(claimed.tempKey, Buffer.concat(chunks), "application/octet-stream");
}

export function verifyLocalDownload(token: string) {
  const claims = verifyToken<{ kind: string; key: string; mime: string; disposition: string; exp: number }>(token);
  if (!claims || claims.kind !== "get" || !(storage instanceof LocalDriver)) return null;
  return { file: storage.localFile(claims.key), mime: claims.mime, disposition: claims.disposition };
}

async function rejectUpload(uploadId: string, tempKey: string) {
  await db.update(uploads).set({ status: "REJECTED" }).where(and(eq(uploads.id, uploadId), eq(uploads.status, "PENDING")));
  await storage.delete(tempKey);
}

// ---------- Konfirmasi (PRD 6.6): prepare di luar transaksi, commit di dalam, cleanup setelah commit ----------
export interface PreparedUpload {
  uploadId: string;
  documentTypeId: string;
  documentId: string;
  isNew: boolean;
  finalKey: string;
  tempKey: string;
  originalName: string;
  detected: DetectedFile;
  size: number;
}

/** Membaca, memeriksa, lalu menulis buffer yang sama ke key final. Tidak memegang kunci baris. */
export async function prepareUpload(registrationId: string, uploadId: string): Promise<PreparedUpload> {
  const [u] = await db.select().from(uploads).where(and(eq(uploads.id, uploadId), eq(uploads.registrationId, registrationId)));
  if (!u) throw notFound("Unggahan");
  if (u.status !== "PENDING") throw new ApiError(409, "CONFLICT", "Unggahan ini sudah diproses");
  const read = await storage.read(u.tempKey, MAX_FILE_BYTES);
  if (read.kind === "missing") throw new ApiError(422, "FILE_REJECTED", "File belum sampai ke penyimpanan. Coba unggah lagi.");
  if (read.kind === "too_large") {
    await rejectUpload(u.id, u.tempKey);
    throw new ApiError(422, "FILE_REJECTED", "Ukuran file melebihi 5 MB");
  }
  const detected = detectFileType(read.bytes);
  if (!detected) {
    await rejectUpload(u.id, u.tempKey);
    throw new ApiError(422, "FILE_REJECTED", "Format file tidak diterima. Gunakan PDF, DOC, DOCX, JPG, atau PNG.");
  }
  const [existing] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.registrationId, registrationId), eq(documents.documentTypeId, u.documentTypeId)));
  const documentId = existing?.id ?? newId();
  const finalKey = `registrations/${registrationId}/${documentId}/${u.id}.${detected.ext}`;
  await storage.write(finalKey, read.bytes, detected.mime);
  return { uploadId: u.id, documentTypeId: u.documentTypeId, documentId, isNew: !existing, finalKey, tempKey: u.tempKey, originalName: u.originalName, detected, size: read.bytes.byteLength };
}

export type CommitResult = { outcome: "committed"; oldKey: string | null; documentId: string } | { outcome: "duplicate"; documentId: string };

/** Dipanggil pemanggil setelah mengunci baris pendaftaran. Status dibaca ulang oleh pemanggil (6.7). */
export async function commitUpload(tx: Tx, ctx: RegistrationContext, p: PreparedUpload, meta: EventMeta): Promise<CommitResult> {
  const [u] = await tx.select().from(uploads).where(eq(uploads.id, p.uploadId));
  if (u?.status !== "PENDING") return { outcome: "duplicate", documentId: p.documentId };
  const [existing] = await tx.select().from(documents).where(and(eq(documents.registrationId, ctx.registrationId), eq(documents.documentTypeId, p.documentTypeId)));
  if (!canReplaceDocument(ctx.status, existing?.verificationStatus ?? null)) throw new ApiError(409, "FILE_LOCKED", "Berkas ini tidak bisa diganti pada status pendaftaran saat ini");
  const fields = { objectKey: p.finalKey, originalName: p.originalName, mimeType: p.detected.mime, sizeBytes: p.size, uploadedAt: new Date(), verificationStatus: "PENDING" as const, notes: null, verifiedBy: null, verifiedAt: null };
  let oldKey: string | null = null;
  let documentId = p.documentId;
  if (existing) {
    oldKey = existing.objectKey;
    documentId = existing.id;
    await tx.update(documents).set({ ...fields, replacedAt: new Date() }).where(eq(documents.id, existing.id));
    const names = await eventService.documentTypeNames([p.documentTypeId], tx);
    await emit(tx, "document.replaced", { registrationId: ctx.registrationId, documentId, documentName: names.get(p.documentTypeId) ?? "" }, meta);
  } else {
    await tx.insert(documents).values({ id: p.documentId, registrationId: ctx.registrationId, documentTypeId: p.documentTypeId, ...fields });
  }
  await tx.update(uploads).set({ status: "CONFIRMED" }).where(eq(uploads.id, p.uploadId));
  return { outcome: "committed", oldKey, documentId };
}

// ---------- Syarat ----------
export async function assertRequiredUploaded(tx: Tx, eventId: string, registrationId: string) {
  const reqs = (await eventService.listRequirements(eventId, tx)).filter((r) => r.is_required);
  const have = new Set((await listFor(registrationId, tx)).map((d) => d.documentTypeId));
  const missing = reqs.filter((r) => !have.has(r.document_type_id));
  if (missing.length) throw new ApiError(422, "DOCUMENTS_INCOMPLETE", `Dokumen wajib belum lengkap: ${missing.map((m) => m.name).join(", ")}`);
}

export async function requiredNotValid(eventId: string, registrationId: string, conn: DbOrTx = db): Promise<string[]> {
  const reqs = (await eventService.listRequirements(eventId, conn)).filter((r) => r.is_required);
  const docs = await listFor(registrationId, conn);
  return reqs.filter((r) => docs.find((d) => d.documentTypeId === r.document_type_id)?.verificationStatus !== "VALID").map((r) => r.name);
}

export async function assertRequiredValid(tx: Tx, eventId: string, registrationId: string) {
  const bad = await requiredNotValid(eventId, registrationId, tx);
  if (bad.length) throw new ApiError(422, "DOCUMENTS_NOT_VALID", `Dokumen wajib belum VALID: ${bad.join(", ")}`);
}

// ---------- Hapus dan verifikasi ----------
/** File hanya bisa dihapus saat DRAFT (PRD 6.6). Objek dihapus pemanggil setelah commit. */
export async function remove(tx: Tx, ctx: RegistrationContext, documentId: string): Promise<string> {
  const doc = await getById(documentId, tx);
  if (!doc || doc.registrationId !== ctx.registrationId) throw notFound("Dokumen");
  if (ctx.status !== "DRAFT") throw new ApiError(409, "FILE_LOCKED", "File hanya bisa dihapus saat draft. Setelah submit, file hanya bisa diganti.");
  await tx.delete(documents).where(eq(documents.id, documentId));
  return doc.objectKey;
}

export async function verify(tx: Tx, ctx: RegistrationContext, mail: RegistrationMailData, documentId: string, input: { status: VerificationStatus; notes: string | null }, staffId: string, meta: EventMeta) {
  if (!canVerifyDocument(ctx.status)) throw new ApiError(409, "FILE_LOCKED", "Dokumen hanya bisa diverifikasi saat Under Review atau Waiting List");
  const doc = await getById(documentId, tx);
  if (!doc || doc.registrationId !== ctx.registrationId) throw notFound("Dokumen");
  await tx.update(documents).set({ verificationStatus: input.status, notes: input.notes, verifiedBy: staffId, verifiedAt: new Date(), replacedAt: null }).where(eq(documents.id, documentId));
  const names = await eventService.documentTypeNames([doc.documentTypeId], tx);
  await emit(tx, "document.verified", { ...mail, documentId, documentName: names.get(doc.documentTypeId) ?? "", status: input.status, notes: input.notes }, meta);
}

export function downloadUrl(doc: DocumentRow) {
  return storage.downloadUrl(doc.objectKey, { mime: doc.mimeType, filename: doc.originalName, attachment: isAttachment(doc.mimeType) });
}

// ---------- Pembersihan (dijalankan worker) ----------
export async function cleanupUploads(): Promise<{ expired: number; swept: number }> {
  const stale = await db.update(uploads).set({ status: "EXPIRED" }).where(and(eq(uploads.status, "PENDING"), lt(uploads.expiresAt, new Date()))).returning({ id: uploads.id });
  // Sapu seluruh prefix: termasuk objek yang muncul karena PUT ulang setelah konfirmasi.
  const swept = await storage.sweepTemp(UPLOAD_TTL_MS);
  return { expired: stale.length, swept };
}

export const pingStorage = () => storage.ping();

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, newId, type DbOrTx, type Tx } from "../../shared/db/client";
import { ApiError, notFound } from "../../shared/http/errors";
import { documentTypes, eventDocumentRequirements, eventPrograms, events } from "./events.table";

export type EventRow = typeof events.$inferSelect;

/** Fakta dari modul registrations, dioper sebagai parameter (PRD aturan 3). */
export interface EventUsage {
  hasSubmitted: boolean;
  slotsUsed: number;
  programIdsUsed: string[];
}

export interface EventInput {
  name: string;
  slug?: string;
  type: EventRow["type"];
  description: string;
  registration_prefix: string;
  start_at: string;
  end_at: string;
  quota_mode: EventRow["quotaMode"];
  quota: number | null;
  requires_program: boolean;
  status: EventRow["status"];
}

export const toJson = (e: EventRow) => ({
  id: e.id, name: e.name, slug: e.slug, type: e.type, description: e.description, registration_prefix: e.registrationPrefix,
  start_at: e.startAt, end_at: e.endAt, quota_mode: e.quotaMode, quota: e.quota, requires_program: e.requiresProgram,
  status: e.status, last_seq: e.lastSeq, created_at: e.createdAt, updated_at: e.updatedAt,
});

export const getById = async (id: string, conn: DbOrTx = db) => (await conn.select().from(events).where(eq(events.id, id)))[0] ?? null;
export const getBySlug = async (slug: string) => (await db.select().from(events).where(eq(events.slug, slug)))[0] ?? null;

export const list = () => db.select().from(events).orderBy(desc(events.createdAt));
export const listPublished = () => db.select().from(events).where(eq(events.status, "PUBLISHED")).orderBy(asc(events.endAt));

/** Status dan periode (PRD 6.1). Slot FCFS dicek terpisah oleh pemanggil. */
export function isWithinPeriod(e: EventRow, now = new Date()) {
  return e.status === "PUBLISHED" && e.startAt <= now && now <= e.endAt;
}

/** Mengunci baris event selama transaksi; semua pengecekan kuota lewat sini. */
export async function lockForQuota(tx: Tx, id: string): Promise<EventRow> {
  const [row] = await tx.select().from(events).where(eq(events.id, id)).for("update");
  if (!row) throw notFound("Event");
  return row;
}

/** Dinaikkan di transaksi submit yang sama, jadi draft tidak menghabiskan nomor (PRD 6.3). */
export async function nextSeq(tx: Tx, e: EventRow): Promise<number> {
  const seq = e.lastSeq + 1;
  await tx.update(events).set({ lastSeq: seq }).where(eq(events.id, e.id));
  return seq;
}

function makeSlug(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "event";
  return `${base}-${newId().slice(-6)}`;
}

function uniqueError(err: unknown) {
  const e = err as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const src = e.code === "23505" ? e : e.cause?.code === "23505" ? e.cause : null;
  if (!src) return null;
  if (src.constraint_name?.includes("prefix")) return new ApiError(409, "CONFLICT", "Prefix sudah dipakai event lain", { registration_prefix: "Prefix sudah dipakai event lain" });
  if (src.constraint_name?.includes("slug")) return new ApiError(409, "CONFLICT", "Slug sudah dipakai event lain", { slug: "Slug sudah dipakai event lain" });
  return new ApiError(409, "CONFLICT", "Data sudah ada");
}

const columns = (i: EventInput) => ({
  name: i.name, type: i.type, description: i.description, registrationPrefix: i.registration_prefix,
  startAt: new Date(i.start_at), endAt: new Date(i.end_at), quotaMode: i.quota_mode, quota: i.quota,
  requiresProgram: i.requires_program, status: i.status,
});

export async function create(tx: Tx, input: EventInput, staffId: string) {
  try {
    const [row] = await tx.insert(events).values({ id: newId(), slug: input.slug ?? makeSlug(input.name), createdBy: staffId, ...columns(input) }).returning();
    return row!;
  } catch (err) {
    throw uniqueError(err) ?? err;
  }
}

export async function update(tx: Tx, id: string, input: EventInput, usage: (e: EventRow) => Promise<EventUsage>) {
  const current = await lockForQuota(tx, id);
  const u = await usage(current);
  // EV-04: dihitung dengan mode lama supaya pembanding slot benar.
  if (u.hasSubmitted && input.registration_prefix !== current.registrationPrefix) {
    throw new ApiError(409, "EVENT_LOCKED", "Prefix terkunci karena sudah ada pendaftaran yang submit", { registration_prefix: "Prefix terkunci" });
  }
  if (u.hasSubmitted && input.quota_mode !== current.quotaMode) {
    throw new ApiError(409, "EVENT_LOCKED", "Mode kuota terkunci karena sudah ada pendaftaran yang submit", { quota_mode: "Mode kuota terkunci" });
  }
  if (input.quota !== null && input.quota < u.slotsUsed) {
    throw new ApiError(409, "EVENT_LOCKED", `Kuota tidak bisa di bawah slot terpakai (${u.slotsUsed})`, { quota: `Minimal ${u.slotsUsed}` });
  }
  try {
    const [row] = await tx.update(events).set({ ...columns(input), ...(input.slug ? { slug: input.slug } : {}), updatedAt: new Date() }).where(eq(events.id, id)).returning();
    return row!;
  } catch (err) {
    throw uniqueError(err) ?? err;
  }
}

// ---------- Program ----------
export const listPrograms = (eventId: string, conn: DbOrTx = db) => conn.select().from(eventPrograms).where(eq(eventPrograms.eventId, eventId)).orderBy(asc(eventPrograms.name));
export const getProgram = async (id: string, conn: DbOrTx = db) => (await conn.select().from(eventPrograms).where(eq(eventPrograms.id, id)))[0] ?? null;

export async function createProgram(tx: Tx, eventId: string, name: string) {
  if (!(await getById(eventId, tx))) throw notFound("Event");
  const [row] = await tx.insert(eventPrograms).values({ id: newId(), eventId, name }).returning();
  return row!;
}

export async function updateProgram(tx: Tx, eventId: string, id: string, input: { name?: string; is_active?: boolean }) {
  const [row] = await tx
    .update(eventPrograms)
    .set({ ...(input.name !== undefined ? { name: input.name } : {}), ...(input.is_active !== undefined ? { isActive: input.is_active } : {}) })
    .where(and(eq(eventPrograms.id, id), eq(eventPrograms.eventId, eventId)))
    .returning();
  if (!row) throw notFound("Program");
  return row;
}

export async function deleteProgram(tx: Tx, eventId: string, id: string, used: string[]) {
  if (used.includes(id)) throw new ApiError(409, "EVENT_LOCKED", "Program sudah dipilih pendaftar dan tidak bisa dihapus. Nonaktifkan saja.");
  await tx.delete(eventPrograms).where(and(eq(eventPrograms.id, id), eq(eventPrograms.eventId, eventId)));
}

// ---------- Jenis dokumen ----------
export const listDocumentTypes = () => db.select().from(documentTypes).orderBy(asc(documentTypes.name));
export async function documentTypeNames(ids: string[], conn: DbOrTx = db) {
  if (!ids.length) return new Map<string, string>();
  const rows = await conn.select({ id: documentTypes.id, name: documentTypes.name }).from(documentTypes).where(inArray(documentTypes.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function createDocumentType(tx: Tx, input: { name: string; description?: string | null }) {
  const dup = await tx.select({ id: documentTypes.id }).from(documentTypes).where(eq(documentTypes.name, input.name));
  if (dup.length) throw new ApiError(409, "CONFLICT", "Jenis dokumen sudah ada", { name: "Jenis dokumen sudah ada" });
  const [row] = await tx.insert(documentTypes).values({ id: newId(), name: input.name, description: input.description ?? null }).returning();
  return row!;
}

export async function updateDocumentType(tx: Tx, id: string, input: { name?: string; description?: string | null }) {
  const [row] = await tx
    .update(documentTypes)
    .set({ ...(input.name !== undefined ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description } : {}) })
    .where(eq(documentTypes.id, id))
    .returning();
  if (!row) throw notFound("Jenis dokumen");
  return row;
}

// ---------- Syarat dokumen ----------
export async function listRequirements(eventId: string, conn: DbOrTx = db) {
  return conn
    .select({ document_type_id: eventDocumentRequirements.documentTypeId, name: documentTypes.name, description: documentTypes.description, is_required: eventDocumentRequirements.isRequired, notes: eventDocumentRequirements.notes })
    .from(eventDocumentRequirements)
    .innerJoin(documentTypes, eq(documentTypes.id, eventDocumentRequirements.documentTypeId))
    .where(eq(eventDocumentRequirements.eventId, eventId))
    .orderBy(asc(documentTypes.name));
}

/** EV-04: syarat terkunci setelah ada pendaftaran yang submit, supaya pendaftar lama tidak buntu. */
export async function replaceRequirements(tx: Tx, eventId: string, items: { document_type_id: string; is_required: boolean; notes?: string | null }[], usage: (e: EventRow) => Promise<EventUsage>) {
  const e = await lockForQuota(tx, eventId);
  if ((await usage(e)).hasSubmitted) throw new ApiError(409, "EVENT_LOCKED", "Syarat dokumen terkunci karena sudah ada pendaftaran yang submit");
  await tx.delete(eventDocumentRequirements).where(eq(eventDocumentRequirements.eventId, eventId));
  if (items.length) {
    await tx.insert(eventDocumentRequirements).values(items.map((i) => ({ eventId, documentTypeId: i.document_type_id, isRequired: i.is_required, notes: i.notes ?? null })));
  }
}

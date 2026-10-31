import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db, newId, paginate, type Tx } from "../../shared/db/client";
import { on, type EventMeta } from "../../shared/events/bus";
import { activityLogs } from "./audit.table";

interface Entry {
  action: string;
  entityType: string;
  entityId?: string | null;
  registrationId?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
}

async function write(tx: Tx, e: Entry, meta: EventMeta) {
  await tx.insert(activityLogs).values({
    id: newId(),
    actorType: meta.actorType,
    actorId: meta.actorId ?? null,
    ipAddress: meta.ip ?? null,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    registrationId: e.registrationId ?? null,
    description: e.description,
    metadata: e.metadata ?? null,
  });
}

/** Penulisan ke audit hanya lewat event (PRD aturan 4). Kode OTP dan rahasia tidak pernah ikut tercatat. */
export function registerAuditListeners() {
  on("participant.registered", (tx, p, m) =>
    write(tx, { action: "PARTICIPANT_REGISTERED", entityType: "participant", entityId: p.participantId, description: `Akun pendaftar baru: ${p.name}` }, m),
  );
  on("otp.requested", (tx, p, m) =>
    write(tx, { action: "OTP_REQUESTED", entityType: "participant", entityId: p.participantId, description: `OTP ${p.purpose} dikirim`, metadata: { purpose: p.purpose } }, m),
  );
  on("registration.submitted", (tx, p, m) =>
    write(tx, { action: "REGISTRATION_SUBMITTED", entityType: "registration", entityId: p.registrationId, registrationId: p.registrationId, description: `Pendaftaran ${p.number} dikirim`, metadata: { number: p.number } }, m),
  );
  on("registration.status_changed", (tx, p, m) =>
    write(tx, { action: "STATUS_CHANGED", entityType: "registration", entityId: p.registrationId, registrationId: p.registrationId, description: `Status ${p.from} → ${p.to}`, metadata: { from: p.from, to: p.to, notes: p.notes } }, m),
  );
  on("document.verified", (tx, p, m) =>
    write(tx, { action: "DOCUMENT_VERIFIED", entityType: "document", entityId: p.documentId, registrationId: p.registrationId, description: `${p.documentName} ditandai ${p.status}`, metadata: { status: p.status, notes: p.notes } }, m),
  );
  on("document.replaced", (tx, p, m) =>
    write(tx, { action: "DOCUMENT_REPLACED", entityType: "document", entityId: p.documentId, registrationId: p.registrationId, description: `${p.documentName} diganti pendaftar` }, m),
  );
  on("report.exported", (tx, p, m) =>
    write(tx, { action: "REPORT_EXPORTED", entityType: "report", description: `Export ${p.format} berisi ${p.rows} baris`, metadata: { format: p.format, rows: p.rows, filters: p.filters } }, m),
  );
  on("settings.changed", (tx, p, m) =>
    write(tx, { action: "SETTINGS_CHANGED", entityType: "settings", description: `Pengaturan ${p.section} diubah`, metadata: { keys: p.keys } }, m),
  );
  on("activity", (tx, p, m) => write(tx, p, m));
}

export async function listForRegistration(registrationId: string) {
  return db.select().from(activityLogs).where(eq(activityLogs.registrationId, registrationId)).orderBy(desc(activityLogs.createdAt)).limit(200);
}

export async function listForEntity(entityType: string, entityId: string) {
  return db.select().from(activityLogs).where(and(eq(activityLogs.entityType, entityType), eq(activityLogs.entityId, entityId))).orderBy(desc(activityLogs.createdAt)).limit(200);
}

export async function list(f: { actor_id?: string; action?: string; entity_type?: string; from?: string; to?: string; page?: number }) {
  const where: SQL[] = [];
  if (f.actor_id) where.push(eq(activityLogs.actorId, f.actor_id));
  if (f.action) where.push(eq(activityLogs.action, f.action));
  if (f.entity_type) where.push(eq(activityLogs.entityType, f.entity_type));
  if (f.from) where.push(gte(activityLogs.createdAt, new Date(`${f.from}T00:00:00+07:00`)));
  if (f.to) where.push(lte(activityLogs.createdAt, new Date(`${f.to}T23:59:59.999+07:00`)));
  const { page, limit, offset } = paginate(f.page);
  const cond = where.length ? and(...where) : undefined;
  const [rows, total] = await Promise.all([
    db.select().from(activityLogs).where(cond).orderBy(desc(activityLogs.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(activityLogs).where(cond),
  ]);
  return { rows, total: total[0]!.n, page, page_size: limit };
}

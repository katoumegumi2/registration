import { findTransition, nextTransitions, type RegistrationStatus, type VerificationStatus } from "@pendaftaran/shared";
import type { StaffPrincipal } from "../../shared/http/route";
import { db } from "../../shared/db/client";
import type { EventMeta } from "../../shared/events/bus";
import { ApiError, invalidTransition, notFound } from "../../shared/http/errors";
import { audit } from "../audit";
import { documentService } from "../documents";
import { eventService } from "../events";
import { participantService } from "../participants";
import { registrationService } from "../registrations";

/** Use case staff (PRD 6.5 + 6.7). Urutan kunci: baris event, lalu baris pendaftaran. */
export async function transition(staff: StaffPrincipal, id: string, to: RegistrationStatus, notes: string | null | undefined, meta: EventMeta) {
  const peek = await registrationService.getById(id);
  if (!peek) throw notFound("Pendaftaran");
  return db.transaction(async (tx) => {
    const event = await eventService.lockForQuota(tx, peek.eventId);
    const r = await registrationService.lock(tx, id);
    const rule = findTransition(r.status, to);
    if (!rule || rule.by === "PARTICIPANT") throw invalidTransition();
    if (rule.selectionOnly && event.quotaMode !== "SELECTION") throw invalidTransition("Waiting List hanya untuk mode seleksi");
    if (rule.by === "ADMIN" && staff.role !== "ADMIN") throw new ApiError(403, "FORBIDDEN", "Koreksi status hanya bisa dilakukan admin");
    if (rule.notesRequired && !notes?.trim()) throw new ApiError(422, "NOTES_REQUIRED", "Catatan wajib diisi", { notes: "Catatan wajib diisi" });
    if (rule.requiresValidDocuments) await documentService.assertRequiredValid(tx, r.eventId, r.id);
    if (rule.quotaCheck === event.quotaMode) registrationService.assertQuota(event, await registrationService.slotsUsed(event.id, event.quotaMode, tx));
    return registrationService.changeStatus(tx, r, to, { notes, staffId: staff.id, meta });
  });
}

export async function verifyDocument(staff: StaffPrincipal, documentId: string, input: { status: VerificationStatus; notes: string | null }, meta: EventMeta) {
  if (input.status === "INVALID" && !input.notes?.trim()) throw new ApiError(422, "NOTES_REQUIRED", "Catatan wajib diisi untuk dokumen tidak valid", { notes: "Catatan wajib diisi" });
  const doc = await documentService.getById(documentId);
  if (!doc) throw notFound("Dokumen");
  await db.transaction(async (tx) => {
    const r = await registrationService.lock(tx, doc.registrationId);
    const mail = await registrationService.mailData(r, tx);
    await documentService.verify(tx, registrationService.contextOf(r), mail, documentId, input, staff.id, meta);
  });
}

/** Tombol yang sah beserta alasan bila nonaktif (MP-05). */
export async function availableTransitions(staff: StaffPrincipal, r: { id: string; status: RegistrationStatus; eventId: string }) {
  const e = (await eventService.getById(r.eventId))!;
  const used = await registrationService.slotsUsed(e.id, e.quotaMode);
  const full = e.quota !== null && used >= e.quota;
  const invalidDocs = await documentService.requiredNotValid(e.id, r.id);
  return nextTransitions(r.status, e.quotaMode)
    .filter((t) => t.by !== "ADMIN" || staff.role === "ADMIN")
    .map((t) => {
      let disabledReason: string | null = null;
      if (t.requiresValidDocuments && invalidDocs.length) disabledReason = `Dokumen wajib belum VALID: ${invalidDocs.join(", ")}`;
      else if (t.quotaCheck === e.quotaMode && full) disabledReason = "Kuota penuh";
      return { to: t.to, notes_required: !!t.notesRequired, correction: t.by === "ADMIN", disabled_reason: disabledReason };
    });
}

export async function detail(staff: StaffPrincipal, id: string) {
  const r = await registrationService.getById(id);
  if (!r || r.status === "DRAFT") throw notFound("Pendaftaran");
  const [view, participant, logs, transitions] = await Promise.all([
    registrationService.view(r),
    participantService.getById(r.participantId),
    audit.listForRegistration(r.id),
    availableTransitions(staff, r),
  ]);
  return {
    ...view,
    // NIK utuh hanya di detail (PRD 11).
    participant: participantService.toProfile(participant!),
    activity_logs: logs.map((l) => ({ id: l.id, action: l.action, description: l.description, actor_type: l.actorType, actor_id: l.actorId, created_at: l.createdAt })),
    transitions,
  };
}

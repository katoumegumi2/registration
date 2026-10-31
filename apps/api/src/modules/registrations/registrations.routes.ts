import { z } from "@hono/zod-openapi";
import { notFound } from "../../shared/http/errors";
import { participantMeta, route, type App } from "../../shared/http/route";
import { authService, participantOnly } from "../auth";
import { documentService } from "../documents";
import { eventService } from "../events";
import { registrationService } from ".";

export function registerRegistrationRoutes(app: App) {
  // ---------- Publik: butuh hitungan slot, jadi dirakit di modul ini ----------
  route(app, { method: "get", path: "/events", tag: "Publik", summary: "Event yang dipublikasikan, status buka, sisa kuota" }, async () => {
    const rows = await eventService.listPublished();
    return Promise.all(rows.map(registrationService.publicEventView));
  });

  route(app, { method: "get", path: "/events/{slug}", tag: "Publik", summary: "Detail event, program, syarat dokumen" }, async ({ params }) => {
    const e = await eventService.getBySlug(params.slug!);
    if (!e || e.status === "DRAFT") throw notFound("Event");
    const [view, programs, requirements] = await Promise.all([registrationService.publicEventView(e), eventService.listPrograms(e.id), eventService.listRequirements(e.id)]);
    return { ...view, programs: programs.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name })), requirements };
  });

  // ---------- Pendaftar ----------
  route(app, { method: "get", path: "/me/registrations", tag: "Pendaftaran", summary: "Semua pendaftaran milik akun", middleware: participantOnly }, async ({ c }) => registrationService.listMine(c.get("participantId")));

  route(app, { method: "post", path: "/events/{id}/registrations", tag: "Pendaftaran", summary: "Buat draft", middleware: participantOnly, status: 201 }, async ({ c, params }) => {
    const res = await registrationService.createDraft(c.get("participantId"), params.id!, participantMeta(c));
    return { id: res.registration.id, status: res.registration.status, existing: res.existing };
  });

  route(app, { method: "get", path: "/me/registrations/{id}", tag: "Pendaftaran", summary: "Detail pendaftaran", middleware: participantOnly }, async ({ c, params }) => registrationService.view(await registrationService.getOwned(c.get("participantId"), params.id!)));

  route(app, { method: "patch", path: "/me/registrations/{id}", tag: "Pendaftaran", summary: "Pilih program selama draft", middleware: participantOnly, body: z.object({ program_id: z.string().uuid().nullable() }) }, async ({ c, body, params }) => {
    const r = await registrationService.setProgram(c.get("participantId"), params.id!, body.program_id, participantMeta(c));
    return registrationService.view(r);
  });

  route(app, { method: "post", path: "/me/registrations/{id}/uploads", tag: "Pendaftaran", summary: "Buat upload_id dan target unggah", middleware: participantOnly, body: z.object({ document_type_id: z.string().uuid(), original_name: z.string().trim().min(1).max(200) }), status: 201 }, async ({ c, body, params }) => {
    const r = await registrationService.getOwned(c.get("participantId"), params.id!);
    return documentService.createUpload(registrationService.contextOf(r), body.document_type_id, body.original_name);
  });

  route(app, { method: "post", path: "/me/registrations/{id}/uploads/{uploadId}/confirm", tag: "Pendaftaran", summary: "Periksa berkas lalu simpan ke key final", middleware: participantOnly }, async ({ c, params }) => registrationService.confirmUpload(c.get("participantId"), params.id!, params.uploadId!, participantMeta(c)));

  route(app, { method: "delete", path: "/me/registrations/{id}/documents/{docId}", tag: "Pendaftaran", summary: "Hapus file, hanya saat draft", middleware: participantOnly }, async ({ c, params }) => {
    await registrationService.removeDocument(c.get("participantId"), params.id!, params.docId!, participantMeta(c));
    return { ok: true };
  });

  route(app, { method: "get", path: "/me/registrations/{id}/documents/{docId}/url", tag: "Pendaftaran", summary: "URL unduh bertanda tangan, 5 menit", middleware: participantOnly }, async ({ c, params }) => {
    await registrationService.getOwned(c.get("participantId"), params.id!);
    const doc = await documentService.getById(params.docId!);
    if (!doc || doc.registrationId !== params.id) throw notFound("Dokumen");
    return { url: documentService.downloadUrl(doc), expires_in: 300 };
  });

  route(app, { method: "post", path: "/me/registrations/{id}/submit", tag: "Pendaftaran", summary: "Submit: cek kuota, ambil nomor, kirim bukti", middleware: participantOnly }, async ({ c, params }) => {
    const id = c.get("participantId");
    authService.assertRate(`submit:${id}`, 5, 60_000, "Terlalu banyak percobaan submit. Coba lagi sebentar.");
    const r = await registrationService.submit(id, params.id!, participantMeta(c));
    return registrationService.view(r);
  });
}

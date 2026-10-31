import { z } from "@hono/zod-openapi";
import { REGISTRATION_STATUSES } from "@pendaftaran/shared";
import { db } from "../../shared/db/client";
import { notFound } from "../../shared/http/errors";
import { route, staffMeta, type App } from "../../shared/http/route";
import { adminOnly, staffOnly } from "../auth";
import { documentService } from "../documents";
import { registrationService } from "../registrations";
import { reviewService } from ".";

export function registerReviewRoutes(app: App) {
  route(app, { method: "get", path: "/admin/registrations/{id}", tag: "Staff", summary: "Detail lengkap, riwayat status, log pendaftar", middleware: staffOnly }, async ({ c, params }) => reviewService.detail(c.get("staff"), params.id!));

  route(app, { method: "post", path: "/admin/registrations/{id}/transitions", tag: "Staff", summary: "Ubah status sesuai aturan 6.5", middleware: staffOnly, body: z.object({ to: z.enum(REGISTRATION_STATUSES), notes: z.string().trim().max(2000).nullable().optional() }) }, async ({ c, body, params }) => {
    await reviewService.transition(c.get("staff"), params.id!, body.to, body.notes, staffMeta(c));
    return reviewService.detail(c.get("staff"), params.id!);
  });

  route(app, { method: "patch", path: "/admin/registrations/{id}/program", tag: "Admin", summary: "Pindah program (PRD 6.4)", middleware: adminOnly, body: z.object({ program_id: z.string().uuid() }) }, async ({ c, body, params }) => {
    await db.transaction((tx) => registrationService.adminSetProgram(tx, params.id!, body.program_id, staffMeta(c)));
    return reviewService.detail(c.get("staff"), params.id!);
  });

  route(app, { method: "patch", path: "/admin/documents/{id}/verification", tag: "Staff", summary: "Tandai dokumen VALID atau INVALID", middleware: staffOnly, body: z.object({ status: z.enum(["VALID", "INVALID"]), notes: z.string().trim().max(2000).nullable().optional() }) }, async ({ c, body, params }) => {
    await reviewService.verifyDocument(c.get("staff"), params.id!, { status: body.status, notes: body.notes ?? null }, staffMeta(c));
    return { ok: true };
  });

  route(app, { method: "get", path: "/admin/documents/{id}/url", tag: "Staff", summary: "URL unduh bertanda tangan untuk pratinjau", middleware: staffOnly }, async ({ params }) => {
    const doc = await documentService.getById(params.id!);
    if (!doc) throw notFound("Dokumen");
    return { url: documentService.downloadUrl(doc), mime_type: doc.mimeType, attachment_only: !(doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/")), expires_in: 300 };
  });
}

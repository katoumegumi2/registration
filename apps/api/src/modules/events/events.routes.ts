import { z } from "@hono/zod-openapi";
import { eventInputSchema } from "@pendaftaran/shared";
import { db, type Tx } from "../../shared/db/client";
import { emit } from "../../shared/events/bus";
import { notFound } from "../../shared/http/errors";
import { route, staffMeta, type App } from "../../shared/http/route";
import { adminOnly } from "../auth";
import { eventService, type EventRow, type EventUsage } from ".";

export interface EventRouteDeps {
  /** Disediakan modul registrations saat aplikasi dirakit, tanpa membuat dependensi melingkar. */
  usage: (tx: Tx, e: EventRow) => Promise<EventUsage>;
}

const requirementsSchema = z.object({
  items: z.array(z.object({ document_type_id: z.string().uuid(), is_required: z.boolean(), notes: z.string().trim().max(500).nullable().optional() })),
});
const docTypeSchema = z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().max(500).nullable().optional() });

export function registerEventRoutes(app: App, deps: EventRouteDeps) {
  route(app, { method: "get", path: "/admin/events", tag: "Admin", summary: "Daftar semua event", middleware: adminOnly }, async () => (await eventService.list()).map(eventService.toJson));

  route(app, { method: "post", path: "/admin/events", tag: "Admin", summary: "Buat event", middleware: adminOnly, body: eventInputSchema, status: 201 }, async ({ c, body }) =>
    db.transaction(async (tx) => {
      const e = await eventService.create(tx, body, c.get("staff").id);
      await emit(tx, "activity", { action: "EVENT_CREATED", entityType: "event", entityId: e.id, description: `Event ${e.name} dibuat` }, staffMeta(c));
      return eventService.toJson(e);
    }),
  );

  route(app, { method: "get", path: "/admin/events/{id}", tag: "Admin", summary: "Detail event untuk admin", middleware: adminOnly }, async ({ params }) => {
    const e = await eventService.getById(params.id!);
    if (!e) throw notFound("Event");
    const usage = await db.transaction((tx) => deps.usage(tx, e));
    return {
      ...eventService.toJson(e),
      programs: (await eventService.listPrograms(e.id)).map((p) => ({ id: p.id, name: p.name, is_active: p.isActive })),
      requirements: await eventService.listRequirements(e.id),
      locked: usage.hasSubmitted,
      slots_used: usage.slotsUsed,
    };
  });

  route(app, { method: "patch", path: "/admin/events/{id}", tag: "Admin", summary: "Ubah event", middleware: adminOnly, body: eventInputSchema }, async ({ c, body, params }) =>
    db.transaction(async (tx) => {
      const e = await eventService.update(tx, params.id!, body, (cur) => deps.usage(tx, cur));
      await emit(tx, "activity", { action: "EVENT_UPDATED", entityType: "event", entityId: e.id, description: `Event ${e.name} diubah` }, staffMeta(c));
      return eventService.toJson(e);
    }),
  );

  route(app, { method: "get", path: "/admin/events/{id}/programs", tag: "Admin", summary: "Program event", middleware: adminOnly }, async ({ params }) =>
    (await eventService.listPrograms(params.id!)).map((p) => ({ id: p.id, name: p.name, is_active: p.isActive })),
  );

  route(app, { method: "post", path: "/admin/events/{id}/programs", tag: "Admin", summary: "Tambah program", middleware: adminOnly, body: z.object({ name: z.string().trim().min(1).max(150) }), status: 201 }, async ({ c, body, params }) =>
    db.transaction(async (tx) => {
      const p = await eventService.createProgram(tx, params.id!, body.name);
      await emit(tx, "activity", { action: "PROGRAM_CREATED", entityType: "event", entityId: params.id!, description: `Program ${p.name} ditambahkan` }, staffMeta(c));
      return { id: p.id, name: p.name, is_active: p.isActive };
    }),
  );

  route(app, { method: "patch", path: "/admin/events/{id}/programs/{programId}", tag: "Admin", summary: "Ubah atau nonaktifkan program", middleware: adminOnly, body: z.object({ name: z.string().trim().min(1).max(150).optional(), is_active: z.boolean().optional() }) }, async ({ c, body, params }) =>
    db.transaction(async (tx) => {
      const p = await eventService.updateProgram(tx, params.id!, params.programId!, body);
      await emit(tx, "activity", { action: "PROGRAM_UPDATED", entityType: "event", entityId: params.id!, description: `Program ${p.name} diubah` }, staffMeta(c));
      return { id: p.id, name: p.name, is_active: p.isActive };
    }),
  );

  route(app, { method: "delete", path: "/admin/events/{id}/programs/{programId}", tag: "Admin", summary: "Hapus program yang belum dipilih", middleware: adminOnly }, async ({ c, params }) => {
    await db.transaction(async (tx) => {
      const e = await eventService.lockForQuota(tx, params.id!);
      await eventService.deleteProgram(tx, e.id, params.programId!, (await deps.usage(tx, e)).programIdsUsed);
      await emit(tx, "activity", { action: "PROGRAM_DELETED", entityType: "event", entityId: e.id, description: "Program dihapus" }, staffMeta(c));
    });
    return { ok: true };
  });

  route(app, { method: "put", path: "/admin/events/{id}/document-requirements", tag: "Admin", summary: "Ganti daftar syarat dokumen", middleware: adminOnly, body: requirementsSchema }, async ({ c, body, params }) =>
    db.transaction(async (tx) => {
      await eventService.replaceRequirements(tx, params.id!, body.items, (e) => deps.usage(tx, e));
      await emit(tx, "activity", { action: "REQUIREMENTS_UPDATED", entityType: "event", entityId: params.id!, description: `Syarat dokumen diubah (${body.items.length} jenis)` }, staffMeta(c));
      return eventService.listRequirements(params.id!, tx);
    }),
  );

  route(app, { method: "get", path: "/admin/document-types", tag: "Admin", summary: "Master jenis dokumen", middleware: adminOnly }, async () => eventService.listDocumentTypes());

  route(app, { method: "post", path: "/admin/document-types", tag: "Admin", summary: "Tambah jenis dokumen", middleware: adminOnly, body: docTypeSchema, status: 201 }, async ({ c, body }) =>
    db.transaction(async (tx) => {
      const t = await eventService.createDocumentType(tx, body);
      await emit(tx, "activity", { action: "DOCUMENT_TYPE_CREATED", entityType: "document_type", entityId: t.id, description: `Jenis dokumen ${t.name} ditambahkan` }, staffMeta(c));
      return t;
    }),
  );

  route(app, { method: "patch", path: "/admin/document-types/{id}", tag: "Admin", summary: "Ubah jenis dokumen", middleware: adminOnly, body: docTypeSchema.partial() }, async ({ c, body, params }) =>
    db.transaction(async (tx) => {
      const t = await eventService.updateDocumentType(tx, params.id!, body);
      await emit(tx, "activity", { action: "DOCUMENT_TYPE_UPDATED", entityType: "document_type", entityId: t.id, description: `Jenis dokumen ${t.name} diubah` }, staffMeta(c));
      return t;
    }),
  );
}

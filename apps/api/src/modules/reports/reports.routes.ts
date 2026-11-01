import { z } from "@hono/zod-openapi";
import { REGISTRATION_STATUSES } from "@pendaftaran/shared";
import { db } from "../../shared/db/client";
import { emit } from "../../shared/events/bus";
import { notFound } from "../../shared/http/errors";
import { pageQuery, route, staffMeta, type App } from "../../shared/http/route";
import { adminOnly, staffOnly } from "../auth";
import { audit } from "../audit";
import * as reports from "./reports.service";

const filters = {
  q: z.string().trim().max(100).optional(),
  event_id: z.string().uuid().optional(),
  status: z.enum(REGISTRATION_STATUSES).optional(),
  program_id: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
};

export function registerReportRoutes(app: App) {
  route(app, { method: "get", path: "/admin/dashboard/stats", tag: "Staff", summary: "Ringkasan, grafik, kuota", middleware: staffOnly, query: z.object({ event_id: z.string().uuid().optional() }) }, async ({ c, query }) => reports.dashboard(query.event_id, c.get("staff").role));

  // Didaftarkan sebelum /admin/registrations/{id}.
  route(app, { method: "get", path: "/admin/registrations/export", tag: "Staff", summary: "Export CSV atau Excel mengikuti filter", middleware: staffOnly, query: z.object({ format: z.enum(["csv", "xlsx"]), ...filters }) }, async ({ c, query }) => {
    const { format, ...f } = query;
    const rows = await reports.countForExport(f);
    await db.transaction((tx) => emit(tx, "report.exported", { format, rows, filters: f }, staffMeta(c)));
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      return new Response(reports.csvStream(f), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pendaftar-${stamp}.csv"` } });
    }
    return new Response(await reports.xlsxBuffer(f), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="pendaftar-${stamp}.xlsx"` } });
  });

  route(app, { method: "get", path: "/admin/registrations", tag: "Staff", summary: "Daftar pendaftar dengan cari dan filter", middleware: staffOnly, query: z.object({ ...filters, ...pageQuery }) }, async ({ query }) => reports.listRegistrations(query));

  route(app, { method: "get", path: "/admin/reports/summary", tag: "Staff", summary: "Data laporan cetak per event", middleware: staffOnly, query: z.object({ event_id: z.string().uuid() }) }, async ({ query }) => {
    const s = await reports.summary(query.event_id);
    if (!s) throw notFound("Event");
    return s;
  });

  route(app, { method: "get", path: "/admin/activity-logs", tag: "Admin", summary: "Log global dengan filter", middleware: adminOnly, query: z.object({ actor_id: z.string().uuid().optional(), action: z.string().max(100).optional(), entity_type: z.string().max(100).optional(), from: filters.from, to: filters.to, ...pageQuery }) }, async ({ query }) => audit.list(query));

  // Daftar event untuk filter di halaman staff (operator tidak punya akses kelola event).
  route(app, { method: "get", path: "/admin/event-options", tag: "Staff", summary: "Pilihan event dan program untuk filter", middleware: staffOnly }, async () => reports.eventOptions());
}

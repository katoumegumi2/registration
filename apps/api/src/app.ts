import { Scalar } from "@scalar/hono-api-reference";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { config, isHttps } from "./shared/config";
import { db } from "./shared/db/client";
import { ApiError } from "./shared/http/errors";
import { createApp, type AppContext } from "./shared/http/route";
import { registerAuthRoutes } from "./modules/auth/auth.routes";
import { registerAuditListeners } from "./modules/audit/audit.service";
import { documentService } from "./modules/documents";
import { registerLocalFileRoutes } from "./modules/documents/documents.routes";
import { registerEventRoutes } from "./modules/events/events.routes";
import { registerNotificationListeners } from "./modules/notifications/notifications.service";
import { registerParticipantRoutes } from "./modules/participants/participants.routes";
import { registrationService } from "./modules/registrations";
import { registerRegistrationRoutes } from "./modules/registrations/registrations.routes";
import { registerReportRoutes } from "./modules/reports/reports.routes";
import { registerReviewRoutes } from "./modules/review/review.routes";
import { registerSettingsRoutes } from "./settings.routes";
import { registerStaffRoutes } from "./modules/staff/staff.routes";

let listenersRegistered = false;

/** Handler outbox dan activity log didaftarkan sekali per proses. */
export function registerListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;
  registerAuditListeners();
  registerNotificationListeners();
}

const appOrigin = new URL(config.appUrl).origin;
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function buildApp() {
  registerListeners();
  const root = createApp();

  root.use("*", async (c, next) => {
    const start = performance.now();
    await next();
    // routePath, bukan path asli: URL unggah lokal memuat token yang tidak boleh masuk log.
    if (process.env.NODE_ENV !== "test") {
      console.log(JSON.stringify({ t: new Date().toISOString(), method: c.req.method, route: c.req.routePath, status: c.res.status, ms: Math.round(performance.now() - start) }));
    }
  });
  root.use("*", secureHeaders({ referrerPolicy: "same-origin", crossOriginOpenerPolicy: isHttps, originAgentCluster: isHttps }));
  root.use("/api/*", cors({ origin: appOrigin, credentials: true }));

  // CSRF: SameSite + pengecekan Origin pada setiap request yang mengubah data (PRD 11).
  root.use("/api/*", async (c, next) => {
    const origin = c.req.header("origin");
    if (UNSAFE.has(c.req.method) && origin && origin !== appOrigin) throw new ApiError(403, "FORBIDDEN", "Origin tidak diizinkan");
    await next();
  });

  root.onError((err, c: AppContext) => {
    if (err instanceof ApiError) {
      return c.json({ error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } }, err.status);
    }
    console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", route: c.req.routePath, message: (err as Error).message }));
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan pada server" } }, 500);
  });

  const api = createApp();
  registerAuthRoutes(api);
  registerParticipantRoutes(api);
  registerStaffRoutes(api);
  registerSettingsRoutes(api);
  registerEventRoutes(api, { usage: registrationService.eventUsage });
  registerRegistrationRoutes(api);
  registerLocalFileRoutes(api);
  registerReportRoutes(api);
  registerReviewRoutes(api);
  api.doc("/openapi.json", { openapi: "3.0.3", info: { title: "API Sistem Pendaftaran Multi-Event", version: "1.0.0" }, servers: [{ url: "/api/v1" }] });
  root.route("/api/v1", api);
  root.notFound((c) => {
    if (c.req.path.startsWith("/api/")) return c.json({ error: { code: "NOT_FOUND", message: "Endpoint tidak ditemukan" } }, 404);
    return c.text("Tidak ditemukan", 404);
  });

  root.get("/docs", Scalar({ url: "/api/v1/openapi.json", pageTitle: "Dokumentasi API" }));

  root.get("/health", async (c) => {
    const [database, storageOk] = await Promise.all([db.execute(sql`select 1`).then(() => true).catch(() => false), documentService.pingStorage().catch(() => false)]);
    return c.json({ status: database && storageOk ? "ok" : "degraded", database, storage: storageOk }, database && storageOk ? 200 : 503);
  });

  // SPA Vue dilayani container API.
  const webDist = process.env.WEB_DIST ?? join(import.meta.dir, "../../web/dist");
  if (existsSync(webDist)) {
    root.use("/assets/*", serveStatic({ root: webDist }));
    root.get("*", async (c, next) => {
      if (c.req.path.startsWith("/api/")) return next();
      return new Response(Bun.file(join(webDist, "index.html")), { headers: { "content-type": "text/html; charset=utf-8" } });
    });
  }
  return root;
}

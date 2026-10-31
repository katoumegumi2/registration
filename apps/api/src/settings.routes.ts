// Route pengaturan dan outbox butuh auth dan notifications, jadi dirakit di luar modul settings (PRD aturan 3).
import { z } from "@hono/zod-openapi";
import { db } from "./shared/db/client";
import { emit } from "./shared/events/bus";
import { ApiError } from "./shared/http/errors";
import { pageQuery, route, staffMeta, type App } from "./shared/http/route";
import { adminOnly } from "./modules/auth";
import { notificationService } from "./modules/notifications";
import { settingsService } from "./modules/settings";

const emailSchema = z.object({
  preset: z.enum(["GMAIL", "DOMAIN", "CUSTOM"]),
  host: z.string().trim().min(1, "Host wajib diisi").max(200),
  port: z.number().int().min(1).max(65535),
  security: z.enum(["STARTTLS", "TLS", "NONE"]),
  auth_type: z.literal("APP_PASSWORD").default("APP_PASSWORD"),
  username: z.string().trim().max(200).default(""),
  password: z.string().max(500).optional(),
  from_name: z.string().trim().max(150).default(""),
  from_address: z.string().trim().email("Alamat pengirim tidak valid"),
  reply_to: z.string().trim().email().or(z.literal("")).default(""),
});

export function registerSettingsRoutes(app: App) {
  route(app, { method: "get", path: "/admin/settings/email", tag: "Admin", summary: "Lihat pengaturan email", middleware: adminOnly }, async () => {
    const { password, ...rest } = await settingsService.getEmail();
    // Password tidak pernah dikirim ke frontend.
    return { ...rest, password_set: !!password };
  });

  route(app, { method: "put", path: "/admin/settings/email", tag: "Admin", summary: "Simpan pengaturan email", middleware: adminOnly, body: emailSchema }, async ({ c, body }) => {
    await db.transaction(async (tx) => {
      const keys = await settingsService.putEmail(tx, body, c.get("staff").id);
      await emit(tx, "settings.changed", { section: "email", keys }, staffMeta(c));
    });
    return { ok: true };
  });

  route(app, { method: "post", path: "/admin/settings/email/test", tag: "Admin", summary: "Kirim email uji sebelum menyimpan", middleware: adminOnly, body: emailSchema.extend({ to: z.string().trim().email("Alamat tujuan tidak valid") }) }, async ({ c, body }) => {
    const current = await settingsService.getEmail();
    const { to, ...form } = body;
    try {
      await notificationService.sendTest({ ...form, password: form.password || current.password }, to);
    } catch (err) {
      throw new ApiError(422, "VALIDATION_ERROR", `Email uji gagal: ${(err as Error).message}`);
    }
    await db.transaction((tx) => emit(tx, "activity", { action: "EMAIL_TEST_SENT", entityType: "settings", description: `Email uji dikirim ke ${to}` }, staffMeta(c)));
    return { sent: true };
  });

  route(app, { method: "get", path: "/admin/settings/app", tag: "Admin", summary: "Lihat pengaturan aplikasi", middleware: adminOnly }, async () => settingsService.getApp());

  route(app, { method: "put", path: "/admin/settings/app", tag: "Admin", summary: "Simpan pengaturan aplikasi", middleware: adminOnly, body: z.object({ app_name: z.string().trim().min(1).max(100), base_url: z.string().trim().url().or(z.literal("")), contact_email: z.string().trim().email().or(z.literal("")) }) }, async ({ c, body }) => {
    await db.transaction(async (tx) => {
      const keys = await settingsService.putApp(tx, body, c.get("staff").id);
      await emit(tx, "settings.changed", { section: "app", keys }, staffMeta(c));
    });
    return { ok: true };
  });

  route(app, { method: "get", path: "/admin/notifications", tag: "Admin", summary: "Pantau outbox", middleware: adminOnly, query: z.object({ status: z.enum(["PENDING", "SENT", "FAILED"]).optional(), ...pageQuery }) }, async ({ query }) => notificationService.list(query));

  route(app, { method: "post", path: "/admin/notifications/{id}/retry", tag: "Admin", summary: "Kirim ulang email gagal", middleware: adminOnly }, async ({ c, params }) => {
    await db.transaction(async (tx) => {
      const n = await notificationService.retry(tx, params.id!);
      if (!n) throw new ApiError(409, "CONFLICT", "Hanya email berstatus gagal yang bisa dikirim ulang");
      await emit(tx, "activity", { action: "EMAIL_RETRIED", entityType: "notification", entityId: n.id, description: `Email ke ${n.recipient} dikirim ulang` }, staffMeta(c));
    });
    notificationService.kick();
    return { ok: true };
  });
}

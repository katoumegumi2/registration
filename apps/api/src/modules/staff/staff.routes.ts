import { z } from "@hono/zod-openapi";
import { passwordSchema, STAFF_ROLES } from "@pendaftaran/shared";
import { db } from "../../shared/db/client";
import { emit } from "../../shared/events/bus";
import { route, staffMeta, type App } from "../../shared/http/route";
import { adminOnly, authService } from "../auth";
import { staffService } from ".";

const createSchema = z.object({
  username: z.string().trim().regex(/^[a-z0-9._-]{3,50}$/, "Username 3–50 karakter: huruf kecil, angka, titik, garis"),
  full_name: z.string().trim().min(2).max(150),
  email: z.string().trim().email().nullable().optional(),
  password: passwordSchema,
  role: z.enum(STAFF_ROLES),
});

const updateSchema = z.object({
  full_name: z.string().trim().min(2).max(150).optional(),
  email: z.string().trim().email().nullable().optional(),
  role: z.enum(STAFF_ROLES).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export function registerStaffRoutes(app: App) {
  route(app, { method: "get", path: "/admin/staff", tag: "Admin", summary: "Daftar staff", middleware: adminOnly }, async () => staffService.list());

  route(app, { method: "post", path: "/admin/staff", tag: "Admin", summary: "Buat staff", middleware: adminOnly, body: createSchema, status: 201 }, async ({ c, body }) =>
    db.transaction(async (tx) => {
      const s = await staffService.create(tx, body);
      await emit(tx, "activity", { action: "STAFF_CREATED", entityType: "staff", entityId: s.id, description: `Staff ${s.username} dibuat`, metadata: { role: s.role } }, staffMeta(c));
      return staffService.toPublic(s);
    }),
  );

  route(app, { method: "patch", path: "/admin/staff/{id}", tag: "Admin", summary: "Ubah atau nonaktifkan staff", middleware: adminOnly, body: updateSchema }, async ({ c, body, params }) =>
    db.transaction(async (tx) => {
      const s = await staffService.update(tx, c.get("staff").id, params.id!, body);
      if (body.status === "INACTIVE") await authService.revokeAll("STAFF", s.id, tx);
      await emit(tx, "activity", { action: "STAFF_UPDATED", entityType: "staff", entityId: s.id, description: `Staff ${s.username} diubah`, metadata: { fields: Object.keys(body) } }, staffMeta(c));
      return staffService.toPublic(s);
    }),
  );

  route(app, { method: "post", path: "/admin/staff/{id}/reset-password", tag: "Admin", summary: "Reset password staff", middleware: adminOnly, body: z.object({ password: passwordSchema }) }, async ({ c, body, params }) => {
    await db.transaction(async (tx) => {
      const s = await staffService.resetPassword(tx, params.id!, body.password);
      await authService.revokeAll("STAFF", s.id, tx);
      await emit(tx, "activity", { action: "STAFF_PASSWORD_RESET", entityType: "staff", entityId: s.id, description: `Password ${s.username} direset` }, staffMeta(c));
    });
    return { ok: true };
  });
}

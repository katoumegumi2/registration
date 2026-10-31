import { z } from "@hono/zod-openapi";
import { emailSchema, otpSchema, passwordSchema, profileSchema } from "@pendaftaran/shared";
import { db } from "../../shared/db/client";
import { emit } from "../../shared/events/bus";
import { ApiError, notFound } from "../../shared/http/errors";
import { pageQuery, participantMeta, route, staffMeta, type App } from "../../shared/http/route";
import { authService, participantOnly, staffOnly } from "../auth";
import { notificationService } from "../notifications";
import { participantService } from ".";

export function registerParticipantRoutes(app: App) {
  route(app, { method: "get", path: "/me", tag: "Profil", summary: "Profil sendiri", middleware: participantOnly }, async ({ c }) => {
    const p = await participantService.getById(c.get("participantId"));
    if (!p) throw notFound("Akun");
    return participantService.toProfile(p);
  });

  // NIK dan email tidak ada di skema ini, jadi tidak bisa diubah lewat endpoint profil (AK-05).
  route(app, { method: "patch", path: "/me", tag: "Profil", summary: "Ubah profil", middleware: participantOnly, body: profileSchema }, async ({ c, body }) => {
    const p = await participantService.updateProfile(c.get("participantId"), body);
    return participantService.toProfile(p);
  });

  route(app, { method: "post", path: "/me/change-email", tag: "Profil", summary: "Kirim OTP ke email baru", middleware: participantOnly, body: z.object({ email: emailSchema }) }, async ({ c, body }) => {
    const id = c.get("participantId");
    const p = await participantService.getById(id);
    if (!p) throw notFound("Akun");
    if (p.email === body.email) throw new ApiError(422, "VALIDATION_ERROR", "Email baru sama dengan email saat ini", { email: "Email baru sama dengan email saat ini" });
    const other = await participantService.getByEmail(body.email);
    if (other) throw new ApiError(409, "DUPLICATE_EMAIL", "Email sudah dipakai akun lain.");
    authService.assertOtpRate(id);
    await db.transaction((tx) => authService.issueOtp(tx, { participantId: id, name: p.fullName, email: body.email, purpose: "CHANGE_EMAIL" }, participantMeta(c)));
    notificationService.kick();
    return { sent: true };
  });

  route(app, { method: "post", path: "/me/change-email/verify", tag: "Profil", summary: "Konfirmasi email baru dengan OTP", middleware: participantOnly, body: z.object({ code: otpSchema }) }, async ({ c, body }) => {
    const id = c.get("participantId");
    const email = await authService.consumeOtp(id, "CHANGE_EMAIL", body.code);
    await db.transaction(async (tx) => {
      await participantService.setEmail(tx, id, email);
      await emit(tx, "activity", { action: "EMAIL_CHANGED", entityType: "participant", entityId: id, description: "Email akun diganti" }, participantMeta(c));
    });
    return { email };
  });

  route(app, { method: "post", path: "/me/change-password", tag: "Profil", summary: "Ganti password", middleware: participantOnly, body: z.object({ current_password: z.string().min(1).max(200), new_password: passwordSchema }) }, async ({ c, body }) => {
    const id = c.get("participantId");
    const p = await participantService.getById(id);
    if (!p || !(await Bun.password.verify(body.current_password, p.passwordHash))) {
      throw new ApiError(422, "INVALID_CREDENTIALS", "Password lama salah", { current_password: "Password lama salah" });
    }
    await db.transaction(async (tx) => {
      await participantService.setPassword(tx, id, body.new_password);
      await emit(tx, "activity", { action: "PASSWORD_CHANGED", entityType: "participant", entityId: id, description: "Password diganti" }, participantMeta(c));
    });
    return { ok: true };
  });

  // ---------- Staff ----------
  route(app, { method: "get", path: "/admin/participants", tag: "Staff", summary: "Cari akun pendaftar", middleware: staffOnly, query: z.object({ q: z.string().trim().max(100).optional(), ...pageQuery }) }, async ({ query }) => participantService.search(query.q, query.page));

  route(app, { method: "post", path: "/admin/participants/{id}/verify", tag: "Staff", summary: "Verifikasi akun manual", middleware: staffOnly }, async ({ c, params }) => {
    const p = await participantService.getById(params.id!);
    if (!p) throw notFound("Akun");
    if (p.emailVerifiedAt) return { already_verified: true };
    await db.transaction(async (tx) => {
      await participantService.markVerified(tx, p.id);
      await emit(tx, "activity", { action: "PARTICIPANT_VERIFIED_MANUALLY", entityType: "participant", entityId: p.id, description: `Akun ${p.email} diverifikasi manual oleh staff` }, staffMeta(c));
    });
    return { already_verified: false };
  });
}

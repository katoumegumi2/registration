import { z } from "@hono/zod-openapi";
import { emailSchema, otpSchema, passwordSchema, registerSchema } from "@pendaftaran/shared";
import { db } from "../../shared/db/client";
import { emit } from "../../shared/events/bus";
import { ApiError } from "../../shared/http/errors";
import { clientIp, publicMeta, route, type App } from "../../shared/http/route";
import { notificationService } from "../notifications";
import { participantService } from "../participants";
import { staffService } from "../staff";
import { authService, staffOnly } from ".";

const WINDOW_15M = 15 * 60_000;
// Hash tetap agar login akun tak dikenal sama lambatnya dengan akun yang ada.
const DUMMY_HASH = await Bun.password.hash("dummy-password-untuk-menyamakan-waktu", "argon2id");

export function registerAuthRoutes(app: App) {
  route(app, { method: "post", path: "/auth/register", tag: "Akun", summary: "Daftar akun, kirim OTP", body: registerSchema, status: 201 }, async ({ c, body }) => {
    await participantService.assertAvailable(body.nik, body.email);
    const meta = publicMeta(c);
    const p = await db.transaction(async (tx) => {
      const created = await participantService.create(tx, body);
      await emit(tx, "participant.registered", { participantId: created.id, name: created.fullName, email: created.email }, { ...meta, actorType: "PARTICIPANT", actorId: created.id });
      await authService.issueOtp(tx, { participantId: created.id, name: created.fullName, email: created.email, purpose: "VERIFY_EMAIL" }, { ...meta, actorType: "PARTICIPANT", actorId: created.id });
      return created;
    });
    authService.rateHit(`otp:min:${p.id}`, 1, 60_000);
    authService.rateHit(`otp:hour:${p.id}`, 5, 3600_000);
    notificationService.kick();
    return { email: p.email };
  });

  route(app, { method: "post", path: "/auth/verify-email", tag: "Akun", summary: "Cek OTP, aktifkan akun, buat sesi", body: z.object({ email: emailSchema, code: otpSchema }) }, async ({ c, body }) => {
    const p = await participantService.getByEmail(body.email);
    if (!p) throw new ApiError(422, "INVALID_OTP", "Kode OTP salah atau sudah kedaluwarsa");
    await authService.consumeOtp(p.id, "VERIFY_EMAIL", body.code);
    await db.transaction(async (tx) => {
      await participantService.markVerified(tx, p.id);
      await emit(tx, "activity", { action: "EMAIL_VERIFIED", entityType: "participant", entityId: p.id, description: "Email terverifikasi dengan OTP" }, { actorType: "PARTICIPANT", actorId: p.id, ip: clientIp(c) });
    });
    await authService.startSession(c, "PARTICIPANT", p.id);
    return participantService.toProfile({ ...p, emailVerifiedAt: new Date() });
  });

  route(app, { method: "post", path: "/auth/resend-otp", tag: "Akun", summary: "Kirim ulang OTP verifikasi", body: z.object({ email: emailSchema }) }, async ({ c, body }) => {
    const p = await participantService.getByEmail(body.email);
    // Jawaban sama agar keberadaan akun tidak bocor.
    if (!p || p.emailVerifiedAt) return { sent: true };
    authService.assertOtpRate(p.id);
    await db.transaction((tx) => authService.issueOtp(tx, { participantId: p.id, name: p.fullName, email: p.email, purpose: "VERIFY_EMAIL" }, { actorType: "PARTICIPANT", actorId: p.id, ip: clientIp(c) }));
    notificationService.kick();
    return { sent: true };
  });

  // Satu pintu login: isian berisi @ diperiksa ke akun pendaftar, selain itu ke akun staff.
  // Username staff tidak boleh memuat @, jadi keduanya tidak bisa tertukar.
  route(app, { method: "post", path: "/auth/login", tag: "Akun", summary: "Login pendaftar (email) atau staff (username)", body: z.object({ identifier: z.string().trim().toLowerCase().min(1, "Wajib diisi").max(200), password: z.string().min(1, "Wajib diisi").max(200) }) }, async ({ c, body }) => {
    const ip = clientIp(c);
    const key = `login:${body.identifier}:${ip}`;
    if (authService.rateBlocked(key, 5)) throw new ApiError(429, "RATE_LIMITED", "Terlalu banyak percobaan gagal. Coba lagi 15 menit lagi.");
    const fail = () => {
      authService.rateHit(key, 5, WINDOW_15M);
      return new ApiError(401, "INVALID_CREDENTIALS", "Email/username atau password salah");
    };

    if (body.identifier.includes("@")) {
      const p = await participantService.getByEmail(body.identifier);
      const ok = await Bun.password.verify(body.password, p?.passwordHash ?? DUMMY_HASH);
      if (!p || !ok) throw fail();
      authService.rateClear(key);
      if (p.status === "SUSPENDED") throw new ApiError(403, "ACCOUNT_SUSPENDED", "Akun ditangguhkan. Hubungi panitia.");
      if (!p.emailVerifiedAt) throw new ApiError(403, "EMAIL_NOT_VERIFIED", "Email belum diverifikasi");
      await authService.startSession(c, "PARTICIPANT", p.id);
      return { type: "PARTICIPANT", user: participantService.toProfile(p) };
    }

    const s = await staffService.getByUsername(body.identifier);
    const ok = await Bun.password.verify(body.password, s?.passwordHash ?? DUMMY_HASH);
    if (!s || !ok || s.status !== "ACTIVE") throw fail();
    authService.rateClear(key);
    await authService.startSession(c, "STAFF", s.id);
    await staffService.touchLogin(s.id);
    await db.transaction((tx) => emit(tx, "activity", { action: "STAFF_LOGIN", entityType: "staff", entityId: s.id, description: `${s.username} masuk` }, { actorType: "STAFF", actorId: s.id, ip }));
    return { type: "STAFF", user: staffService.toPublic(s) };
  });

  route(app, { method: "post", path: "/auth/logout", tag: "Akun", summary: "Logout pendaftar" }, async ({ c }) => {
    await authService.endSession(c, "PARTICIPANT");
    return { ok: true };
  });

  route(app, { method: "post", path: "/auth/forgot-password", tag: "Akun", summary: "Kirim OTP reset password", body: z.object({ email: emailSchema }) }, async ({ c, body }) => {
    const p = await participantService.getByEmail(body.email);
    if (!p) return { sent: true };
    authService.assertOtpRate(p.id);
    await db.transaction((tx) => authService.issueOtp(tx, { participantId: p.id, name: p.fullName, email: p.email, purpose: "RESET_PASSWORD" }, { actorType: "PARTICIPANT", actorId: p.id, ip: clientIp(c) }));
    notificationService.kick();
    return { sent: true };
  });

  route(app, { method: "post", path: "/auth/reset-password", tag: "Akun", summary: "Reset password dengan OTP", body: z.object({ email: emailSchema, code: otpSchema, password: passwordSchema }) }, async ({ c, body }) => {
    const p = await participantService.getByEmail(body.email);
    if (!p) throw new ApiError(422, "INVALID_OTP", "Kode OTP salah atau sudah kedaluwarsa");
    await authService.consumeOtp(p.id, "RESET_PASSWORD", body.code);
    await db.transaction(async (tx) => {
      await participantService.setPassword(tx, p.id, body.password);
      if (!p.emailVerifiedAt) await participantService.markVerified(tx, p.id);
      await authService.revokeAll("PARTICIPANT", p.id, tx);
      await emit(tx, "activity", { action: "PASSWORD_RESET", entityType: "participant", entityId: p.id, description: "Password direset dengan OTP" }, { actorType: "PARTICIPANT", actorId: p.id, ip: clientIp(c) });
    });
    return { ok: true };
  });

  // ---------- Staff ----------
  route(app, { method: "post", path: "/admin/auth/logout", tag: "Staff", summary: "Logout staff" }, async ({ c }) => {
    await authService.endSession(c, "STAFF");
    return { ok: true };
  });

  route(app, { method: "get", path: "/admin/auth/me", tag: "Staff", summary: "Staff yang sedang masuk", middleware: staffOnly }, async ({ c }) => {
    const s = c.get("staff");
    return { id: s.id, username: s.username, full_name: s.fullName, email: s.email, role: s.role };
  });
}

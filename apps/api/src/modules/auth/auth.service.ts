import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import { isHttps } from "../../shared/config";
import { hmac, randomOtp, randomToken, safeEqual, sha256 } from "../../shared/crypto";
import { db, newId, type Tx } from "../../shared/db/client";
import { emit, type EventMeta } from "../../shared/events/bus";
import { ApiError } from "../../shared/http/errors";
import { clientIp, type AppContext, type AppEnv } from "../../shared/http/route";
import { staffService } from "../staff";
import { emailOtps, sessions } from "./auth.table";

export type SubjectType = "STAFF" | "PARTICIPANT";
export type OtpPurpose = "VERIFY_EMAIL" | "RESET_PASSWORD" | "CHANGE_EMAIL";

const COOKIE: Record<SubjectType, string> = { STAFF: "sid_staff", PARTICIPANT: "sid_participant" };
const TTL_MS: Record<SubjectType, number> = { STAFF: 12 * 3600_000, PARTICIPANT: 7 * 24 * 3600_000 };
const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;

// ---------- Sesi ----------
export async function startSession(c: AppContext, type: SubjectType, subjectId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + TTL_MS[type]);
  await db.insert(sessions).values({ id: newId(), tokenHash: sha256(token), subjectType: type, subjectId, expiresAt, ipAddress: clientIp(c), userAgent: c.req.header("user-agent")?.slice(0, 300) ?? null });
  setCookie(c, COOKIE[type], token, { httpOnly: true, sameSite: "Lax", secure: isHttps, path: "/", expires: expiresAt });
}

export async function endSession(c: AppContext, type: SubjectType) {
  const token = getCookie(c, COOKIE[type]);
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  deleteCookie(c, COOKIE[type], { path: "/" });
}

export async function revokeAll(type: SubjectType, subjectId: string, conn: Tx | typeof db = db) {
  await conn.delete(sessions).where(and(eq(sessions.subjectType, type), eq(sessions.subjectId, subjectId)));
}

async function resolve(c: AppContext, type: SubjectType): Promise<string | null> {
  const token = getCookie(c, COOKIE[type]);
  if (!token) return null;
  const [row] = await db.select().from(sessions).where(and(eq(sessions.tokenHash, sha256(token)), eq(sessions.subjectType, type), gt(sessions.expiresAt, new Date())));
  return row?.subjectId ?? null;
}

export const requireParticipant: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = await resolve(c, "PARTICIPANT");
  if (!id) throw new ApiError(401, "UNAUTHENTICATED", "Silakan masuk terlebih dahulu");
  c.set("participantId", id);
  await next();
};

export const requireStaff: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = await resolve(c, "STAFF");
  const s = id ? await staffService.getById(id) : null;
  if (!s || s.status !== "ACTIVE") throw new ApiError(401, "UNAUTHENTICATED", "Silakan masuk terlebih dahulu");
  c.set("staff", { id: s.id, username: s.username, fullName: s.fullName, email: s.email, role: s.role });
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("staff")?.role !== "ADMIN") throw new ApiError(403, "FORBIDDEN", "Hanya admin yang bisa melakukan aksi ini");
  await next();
};

export const staffOnly = [requireStaff];
export const adminOnly = [requireStaff, requireAdmin];
export const participantOnly = [requireParticipant];

// ---------- Rate limit (in-memory, satu instance) ----------
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateHit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

export function rateBlocked(key: string, limit: number): boolean {
  const b = buckets.get(key);
  return !!b && b.resetAt > Date.now() && b.count >= limit;
}

export const rateClear = (key: string) => void buckets.delete(key);
export const rateReset = () => buckets.clear();

export function assertRate(key: string, limit: number, windowMs: number, message = "Terlalu banyak percobaan. Coba lagi nanti.") {
  if (!rateHit(key, limit, windowMs)) throw new ApiError(429, "RATE_LIMITED", message);
}

/** Kirim OTP: 1 per 60 detik dan 5 per jam per akun (PRD 11). */
export function assertOtpRate(participantId: string) {
  assertRate(`otp:min:${participantId}`, 1, 60_000, "Tunggu 60 detik sebelum meminta kode lagi.");
  assertRate(`otp:hour:${participantId}`, 5, 3600_000, "Batas pengiriman kode per jam tercapai.");
}

// ---------- OTP ----------
export async function issueOtp(tx: Tx, p: { participantId: string; name: string; email: string; purpose: OtpPurpose }, meta: EventMeta) {
  const code = randomOtp();
  await tx.update(emailOtps).set({ consumedAt: new Date() }).where(and(eq(emailOtps.participantId, p.participantId), eq(emailOtps.purpose, p.purpose), isNull(emailOtps.consumedAt)));
  await tx.insert(emailOtps).values({ id: newId(), participantId: p.participantId, purpose: p.purpose, email: p.email, codeHash: hmac(`${p.participantId}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  await emit(tx, "otp.requested", { ...p, code }, meta);
}

/** Percobaan salah harus tersimpan walau request gagal, jadi dicek di luar transaksi pemanggil. Mengembalikan email tujuan OTP. */
export async function consumeOtp(participantId: string, purpose: OtpPurpose, code: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [otp] = await tx
      .select()
      .from(emailOtps)
      .where(and(eq(emailOtps.participantId, participantId), eq(emailOtps.purpose, purpose), isNull(emailOtps.consumedAt)))
      .orderBy(desc(emailOtps.createdAt))
      .limit(1)
      .for("update");
    const invalid = () => new ApiError(422, "INVALID_OTP", "Kode OTP salah atau sudah kedaluwarsa");
    if (!otp || otp.expiresAt < new Date() || otp.attempts >= OTP_MAX_ATTEMPTS) throw invalid();
    if (!safeEqual(otp.codeHash, hmac(`${participantId}:${code}`))) {
      await tx.update(emailOtps).set({ attempts: otp.attempts + 1 }).where(eq(emailOtps.id, otp.id));
      return null;
    }
    await tx.update(emailOtps).set({ consumedAt: new Date() }).where(eq(emailOtps.id, otp.id));
    return otp.email;
  }).then((email) => {
    if (email === null) throw new ApiError(422, "INVALID_OTP", "Kode OTP salah atau sudah kedaluwarsa");
    return email;
  });
}

export async function purgeExpired() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

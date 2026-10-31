import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { maskNik } from "@pendaftaran/shared";
import { db, newId, paginate, type DbOrTx, type Tx } from "../../shared/db/client";
import { ApiError } from "../../shared/http/errors";
import { participants } from "./participants.table";

export type Participant = typeof participants.$inferSelect;

export interface ProfileInput {
  full_name: string;
  gender: "L" | "P";
  birth_place: string;
  birth_date: string;
  phone: string;
  address: string;
  institution?: string | null;
  education_level?: string | null;
}

const profileColumns = (p: ProfileInput) => ({
  fullName: p.full_name,
  gender: p.gender,
  birthPlace: p.birth_place,
  birthDate: p.birth_date,
  phone: p.phone,
  address: p.address,
  institution: p.institution ?? null,
  educationLevel: p.education_level ?? null,
});

export const toProfile = (p: Participant) => ({
  id: p.id,
  nik: p.nik,
  full_name: p.fullName,
  gender: p.gender,
  birth_place: p.birthPlace,
  birth_date: p.birthDate,
  email: p.email,
  phone: p.phone,
  address: p.address,
  institution: p.institution,
  education_level: p.educationLevel,
  email_verified_at: p.emailVerifiedAt,
  status: p.status,
  created_at: p.createdAt,
});

export const getById = async (id: string, conn: DbOrTx = db) => (await conn.select().from(participants).where(eq(participants.id, id)))[0] ?? null;
export const getByEmail = async (email: string, conn: DbOrTx = db) => (await conn.select().from(participants).where(eq(participants.email, email)))[0] ?? null;

export async function create(tx: Tx, input: ProfileInput & { nik: string; email: string; password: string }): Promise<Participant> {
  const passwordHash = await Bun.password.hash(input.password, "argon2id");
  try {
    const [row] = await tx.insert(participants).values({ id: newId(), nik: input.nik, email: input.email, passwordHash, ...profileColumns(input) }).returning();
    return row!;
  } catch (err) {
    const msg = duplicateConstraint(err);
    if (msg?.includes("nik")) throw new ApiError(409, "DUPLICATE_NIK", "NIK sudah terdaftar. Silakan masuk atau gunakan lupa password.");
    if (msg?.includes("email")) throw new ApiError(409, "DUPLICATE_EMAIL", "Email sudah dipakai akun lain.");
    throw err;
  }
}

function duplicateConstraint(err: unknown): string | null {
  // Drizzle membungkus error driver; kode unik Postgres ada di `cause`.
  const e = err as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const src = e.code === "23505" ? e : e.cause?.code === "23505" ? e.cause : null;
  return src ? (src.constraint_name ?? "") : null;
}

export async function assertAvailable(nik: string, email: string) {
  const rows = await db.select({ nik: participants.nik, email: participants.email }).from(participants).where(or(eq(participants.nik, nik), eq(participants.email, email)));
  if (rows.some((r) => r.nik === nik)) throw new ApiError(409, "DUPLICATE_NIK", "NIK sudah terdaftar. Silakan masuk atau gunakan lupa password.");
  if (rows.some((r) => r.email === email)) throw new ApiError(409, "DUPLICATE_EMAIL", "Email sudah dipakai akun lain.");
}

export async function updateProfile(id: string, input: ProfileInput) {
  const [row] = await db.update(participants).set({ ...profileColumns(input), updatedAt: new Date() }).where(eq(participants.id, id)).returning();
  return row!;
}

export async function markVerified(tx: Tx, id: string) {
  await tx.update(participants).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(participants.id, id));
}

export async function setEmail(tx: Tx, id: string, email: string) {
  try {
    await tx.update(participants).set({ email, emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(participants.id, id));
  } catch (err) {
    if (duplicateConstraint(err) !== null) throw new ApiError(409, "DUPLICATE_EMAIL", "Email sudah dipakai akun lain.");
    throw err;
  }
}

export async function setPassword(tx: Tx, id: string, password: string) {
  await tx.update(participants).set({ passwordHash: await Bun.password.hash(password, "argon2id"), updatedAt: new Date() }).where(eq(participants.id, id));
}

export async function search(q: string | undefined, pageNo: number | undefined) {
  const { page, limit, offset } = paginate(pageNo);
  const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : null;
  const cond = like ? or(ilike(participants.fullName, like), ilike(participants.email, like), ilike(participants.nik, like)) : undefined;
  const [rows, total] = await Promise.all([
    db.select().from(participants).where(cond).orderBy(desc(participants.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(participants).where(cond),
  ]);
  return {
    rows: rows.map((p) => ({ id: p.id, nik_masked: maskNik(p.nik), full_name: p.fullName, email: p.email, phone: p.phone, email_verified_at: p.emailVerifiedAt, status: p.status, created_at: p.createdAt })),
    total: total[0]!.n,
    page,
    page_size: limit,
  };
}

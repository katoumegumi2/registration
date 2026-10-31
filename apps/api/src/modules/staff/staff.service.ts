import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { StaffRole } from "@pendaftaran/shared";
import { db, newId, type DbOrTx, type Tx } from "../../shared/db/client";
import { ApiError, notFound } from "../../shared/http/errors";
import { staffUsers } from "./staff.table";

export type Staff = typeof staffUsers.$inferSelect;

export const toPublic = (s: Staff) => ({ id: s.id, username: s.username, full_name: s.fullName, email: s.email, role: s.role, status: s.status, last_login_at: s.lastLoginAt, created_at: s.createdAt });

export const getById = async (id: string, conn: DbOrTx = db) => (await conn.select().from(staffUsers).where(eq(staffUsers.id, id)))[0] ?? null;
export const getByUsername = async (username: string) => (await db.select().from(staffUsers).where(eq(staffUsers.username, username)))[0] ?? null;

export const list = async () => (await db.select().from(staffUsers).orderBy(asc(staffUsers.username))).map(toPublic);

export async function touchLogin(id: string) {
  await db.update(staffUsers).set({ lastLoginAt: new Date() }).where(eq(staffUsers.id, id));
}

export async function create(tx: Tx, input: { username: string; full_name: string; email?: string | null; password: string; role: StaffRole }) {
  const existing = await tx.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.username, input.username));
  if (existing.length) throw new ApiError(409, "CONFLICT", "Username sudah dipakai", { username: "Username sudah dipakai" });
  const [row] = await tx
    .insert(staffUsers)
    .values({ id: newId(), username: input.username, fullName: input.full_name, email: input.email ?? null, role: input.role, passwordHash: await Bun.password.hash(input.password, "argon2id") })
    .returning();
  return row!;
}

/** Admin tidak bisa menonaktifkan dirinya sendiri atau admin aktif terakhir (SS-01). */
export async function update(tx: Tx, actorId: string, id: string, input: { full_name?: string; email?: string | null; role?: StaffRole; status?: "ACTIVE" | "INACTIVE" }) {
  // Kunci semua admin aktif agar dua penonaktifan bersamaan tidak menghabiskan admin terakhir.
  await tx.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.role, "ADMIN")).for("update");
  const target = await getById(id, tx);
  if (!target) throw notFound("Staff");
  const losesAdmin = target.role === "ADMIN" && target.status === "ACTIVE" && (input.status === "INACTIVE" || (input.role !== undefined && input.role !== "ADMIN"));
  if (input.status === "INACTIVE" && id === actorId) throw new ApiError(409, "CONFLICT", "Anda tidak bisa menonaktifkan akun sendiri");
  if (losesAdmin) {
    const [others] = await tx.select({ n: sql<number>`count(*)::int` }).from(staffUsers).where(and(eq(staffUsers.role, "ADMIN"), eq(staffUsers.status, "ACTIVE"), ne(staffUsers.id, id)));
    if (!others!.n) throw new ApiError(409, "CONFLICT", "Admin aktif terakhir tidak bisa dinonaktifkan");
  }
  const [row] = await tx
    .update(staffUsers)
    .set({
      ...(input.full_name !== undefined ? { fullName: input.full_name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(staffUsers.id, id))
    .returning();
  return row!;
}

export async function resetPassword(tx: Tx, id: string, password: string) {
  const [row] = await tx.update(staffUsers).set({ passwordHash: await Bun.password.hash(password, "argon2id"), updatedAt: new Date() }).where(eq(staffUsers.id, id)).returning({ id: staffUsers.id, username: staffUsers.username });
  if (!row) throw notFound("Staff");
  return row;
}

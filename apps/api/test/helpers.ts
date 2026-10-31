import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { join } from "node:path";
import { buildApp } from "../src/app";
import { authService } from "../src/modules/auth";
import { eventDocumentRequirements, documentTypes, events } from "../src/modules/events/events.table";
import { notifications } from "../src/modules/notifications/notifications.table";
import { participants } from "../src/modules/participants/participants.table";
import { staffUsers } from "../src/modules/staff/staff.table";
import { db, newId } from "../src/shared/db/client";

export const app = buildApp();
const BASE = "http://localhost/api/v1";

export async function resetDb() {
  await migrate(db, { migrationsFolder: join(import.meta.dir, "../drizzle") });
  await db.execute(sql`truncate activity_logs, notifications, documents, uploads, registration_status_history, registrations, event_document_requirements, event_programs, document_types, events, email_otps, sessions, participants, staff_users, settings cascade`);
  authService.rateReset();
}

/** Klien kecil dengan cookie jar, supaya test berjalan seperti browser. */
export class Client {
  cookies = new Map<string, string>();
  constructor(public ip = "10.0.0.1") {}

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.request(`${BASE}${path}`, {
      method,
      headers: {
        "x-real-ip": this.ip,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const idx = pair!.indexOf("=");
      this.cookies.set(pair!.slice(0, idx), pair!.slice(idx + 1));
    }
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, data: json?.data, code: json?.error?.code as string | undefined, text };
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b?: unknown) => this.req("POST", p, b);
  patch = (p: string, b?: unknown) => this.req("PATCH", p, b);
  put = (p: string, b?: unknown) => this.req("PUT", p, b);
  del = (p: string) => this.req("DELETE", p);
}

let nikCounter = 0;
export const nextNik = () => `3527${String(++nikCounter + 100_000_000_000).slice(0, 12).padStart(12, "0")}`;

export const profile = (over: Record<string, unknown> = {}) => ({
  nik: nextNik(), full_name: "Pendaftar Uji", gender: "L", birth_place: "Sampang", birth_date: "2000-01-15",
  email: `uji${nikCounter}@contoh.local`, phone: "081234567890", address: "Jl. Uji 1", password: "RahasiaSekali1",
  institution: null, education_level: "SMA", ...over,
});

const HASH = await Bun.password.hash("RahasiaSekali1", "argon2id");

/** Akun terverifikasi + sudah login, lewat tabel langsung agar test konkurensi cepat. */
export async function makeParticipant(): Promise<{ client: Client; id: string; email: string }> {
  const id = newId();
  const nik = nextNik();
  const email = `p${nik}@contoh.local`;
  await db.insert(participants).values({ id, nik, email, fullName: `Pendaftar ${nik.slice(-4)}`, gender: "L", birthPlace: "Sampang", birthDate: "2000-01-01", phone: "081234567890", address: "Jl. Uji", passwordHash: HASH, emailVerifiedAt: new Date() });
  const client = new Client();
  const login = await client.post("/auth/login", { email, password: "RahasiaSekali1" });
  if (login.status !== 200) throw new Error(`login gagal: ${login.text}`);
  return { client, id, email };
}

export async function makeStaff(role: "ADMIN" | "OPERATOR"): Promise<{ client: Client; id: string }> {
  const id = newId();
  const username = `${role.toLowerCase()}${nextNik().slice(-6)}`;
  await db.insert(staffUsers).values({ id, username, fullName: username, role, passwordHash: HASH });
  const client = new Client();
  const r = await client.post("/admin/auth/login", { username, password: "RahasiaSekali1" });
  if (r.status !== 200) throw new Error(`login staff gagal: ${r.text}`);
  return { client, id };
}

let prefixCounter = 0;
const nextPrefix = () => {
  const n = prefixCounter++;
  return `T${String.fromCharCode(65 + Math.floor(n / 26))}${String.fromCharCode(65 + (n % 26))}`;
};

export async function makeEvent(opts: { mode: "FCFS" | "SELECTION"; quota: number | null; requiredDocs?: number; optionalDocs?: number; requiresProgram?: boolean }) {
  const id = newId();
  const prefix = nextPrefix();
  await db.insert(events).values({ id, name: `Event ${prefix}`, slug: `event-${prefix.toLowerCase()}`, type: "SEMINAR", registrationPrefix: prefix, startAt: new Date(Date.now() - 3600_000), endAt: new Date(Date.now() + 86_400_000), quotaMode: opts.mode, quota: opts.quota, requiresProgram: !!opts.requiresProgram, status: "PUBLISHED" });
  const required: string[] = [];
  const optional: string[] = [];
  for (const [list, count, isRequired] of [[required, opts.requiredDocs ?? 1, true], [optional, opts.optionalDocs ?? 0, false]] as const) {
    for (let i = 0; i < count; i++) {
      const typeId = newId();
      await db.insert(documentTypes).values({ id: typeId, name: `Dok ${prefix} ${isRequired ? "W" : "O"}${i}` });
      await db.insert(eventDocumentRequirements).values({ eventId: id, documentTypeId: typeId, isRequired });
      list.push(typeId);
    }
  }
  return { id, prefix, required, optional };
}

export const PDF = new TextEncoder().encode("%PDF-1.4 berkas uji");
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
export const EXE = new TextEncoder().encode("MZ\x90\x00 ini program windows");

/** Alur frontend: minta target → PUT → konfirmasi. Target S3/local dipakai apa adanya. */
export async function upload(client: Client, regId: string, typeId: string, bytes: Uint8Array, name = "berkas.pdf") {
  const t = await client.post(`/me/registrations/${regId}/uploads`, { document_type_id: typeId, original_name: name });
  if (t.status !== 201) return { step: "target", ...t, target: null as any };
  const put = await putTo(t.data.url, bytes);
  if (put.status >= 300) return { step: "put", status: put.status, code: undefined, json: null, target: t.data };
  const res = await client.post(`/me/registrations/${regId}/uploads/${t.data.upload_id}/confirm`);
  return { step: "confirm", ...res, target: t.data };
}

/** URL lokal diarahkan ke app langsung; URL S3 ditulis ulang ke endpoint internal karena test berjalan tanpa Nginx. */
export async function putTo(url: string, bytes: Uint8Array) {
  if (url.includes("/api/v1/uploads/")) {
    const path = url.slice(url.indexOf("/api/v1/"));
    return app.request(`http://localhost${path}`, { method: "PUT", body: bytes });
  }
  return fetch(url, { method: "PUT", body: bytes });
}

export async function draftWithDocs(p: { client: Client }, ev: { id: string; required: string[] }) {
  const d = await p.client.post(`/events/${ev.id}/registrations`);
  if (d.status !== 201) throw new Error(`draft gagal: ${d.text}`);
  for (const t of ev.required) {
    const u = await upload(p.client, d.data.id, t, PDF);
    if (u.status !== 200) throw new Error(`unggah gagal: ${JSON.stringify(u)}`);
  }
  return d.data.id as string;
}

export const outboxFor = (recipient: string) => db.select().from(notifications).where(sql`${notifications.recipient} = ${recipient}`);

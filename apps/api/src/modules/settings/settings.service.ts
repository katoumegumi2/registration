import { inArray } from "drizzle-orm";
import { config } from "../../shared/config";
import { decrypt, encrypt } from "../../shared/crypto";
import { db, type DbOrTx, type Tx } from "../../shared/db/client";
import { settings } from "./settings.table";

export interface EmailSettings {
  preset: string;
  host: string;
  port: number;
  security: "STARTTLS" | "TLS" | "NONE";
  auth_type: "APP_PASSWORD";
  username: string;
  password: string;
  from_name: string;
  from_address: string;
  reply_to: string;
}

export interface AppSettings {
  app_name: string;
  base_url: string;
  contact_email: string;
}

const EMAIL_KEYS = ["preset", "host", "port", "security", "auth_type", "username", "password", "from_name", "from_address", "reply_to"] as const;
const APP_KEYS = ["app_name", "base_url", "contact_email"] as const;

async function readSection(section: string, keys: readonly string[], conn: DbOrTx = db) {
  const rows = await conn.select().from(settings).where(inArray(settings.key, keys.map((k) => `${section}.${k}`)));
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key.slice(section.length + 1)] = r.isSecret ? decrypt(r.value) : r.value;
  return out;
}

function parseFrom(from: string) {
  const m = from.match(/^(.*)<(.+)>$/);
  return m ? { name: m[1]!.trim(), address: m[2]!.trim() } : { name: "", address: from.trim() };
}

/** Bila panel belum diisi, sistem memakai SMTP_* dari .env (PRD 10). */
export async function getEmail(conn: DbOrTx = db): Promise<EmailSettings & { source: "panel" | "env" }> {
  const v = await readSection("email", EMAIL_KEYS, conn);
  if (!v.host) {
    const from = parseFrom(config.smtp.from);
    return {
      source: "env", preset: "CUSTOM", host: config.smtp.host, port: config.smtp.port,
      security: config.smtp.port === 465 ? "TLS" : config.smtp.user ? "STARTTLS" : "NONE",
      auth_type: "APP_PASSWORD", username: config.smtp.user, password: config.smtp.pass,
      from_name: from.name, from_address: from.address, reply_to: "",
    };
  }
  return {
    source: "panel", preset: v.preset ?? "CUSTOM", host: v.host, port: Number(v.port ?? 587),
    security: (v.security ?? "STARTTLS") as EmailSettings["security"], auth_type: "APP_PASSWORD",
    username: v.username ?? "", password: v.password ?? "", from_name: v.from_name ?? "",
    from_address: v.from_address ?? "", reply_to: v.reply_to ?? "",
  };
}

/** Field password kosong berarti password lama tetap dipakai. */
export async function putEmail(tx: Tx, input: Omit<EmailSettings, "password"> & { password?: string }, staffId: string) {
  const entries = EMAIL_KEYS.filter((k) => k !== "password").map((k) => ({ key: `email.${k}`, value: String(input[k] ?? ""), isSecret: false }));
  if (input.password) entries.push({ key: "email.password", value: encrypt(input.password), isSecret: true });
  await upsert(tx, entries, staffId);
  return entries.map((e) => e.key);
}

export async function getApp(conn: DbOrTx = db): Promise<AppSettings> {
  const v = await readSection("app", APP_KEYS, conn);
  return {
    app_name: v.app_name || "Sistem Pendaftaran",
    base_url: v.base_url || config.appUrl,
    contact_email: v.contact_email ?? "",
  };
}

export async function putApp(tx: Tx, input: AppSettings, staffId: string) {
  const entries = APP_KEYS.map((k) => ({ key: `app.${k}`, value: input[k] ?? "", isSecret: false }));
  await upsert(tx, entries, staffId);
  return entries.map((e) => e.key);
}

async function upsert(tx: Tx, entries: { key: string; value: string; isSecret: boolean }[], staffId: string) {
  for (const e of entries) {
    await tx
      .insert(settings)
      .values({ ...e, updatedBy: staffId })
      .onConflictDoUpdate({ target: settings.key, set: { value: e.value, isSecret: e.isSecret, updatedBy: staffId, updatedAt: new Date() } });
  }
}

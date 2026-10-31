import type { RegistrationStatus, VerificationStatus } from "@pendaftaran/shared";
import type { Tx } from "../db/client";

export interface EventMeta {
  actorType: "STAFF" | "PARTICIPANT" | "SYSTEM";
  actorId?: string | null;
  ip?: string | null;
}

export interface RegistrationMailData {
  registrationId: string;
  participantId: string;
  number: string | null;
  name: string;
  email: string;
  eventName: string;
  programName: string | null;
}

export interface EventMap {
  "participant.registered": { participantId: string; name: string; email: string };
  "otp.requested": { participantId: string; name: string; email: string; purpose: string; code: string };
  "registration.submitted": RegistrationMailData & { submittedAt: Date };
  "registration.status_changed": RegistrationMailData & { from: RegistrationStatus; to: RegistrationStatus; notes: string | null };
  "document.verified": RegistrationMailData & { documentId: string; documentName: string; status: VerificationStatus; notes: string | null };
  "document.replaced": { registrationId: string; documentId: string; documentName: string };
  "report.exported": { format: string; rows: number; filters: Record<string, unknown> };
  "settings.changed": { section: string; keys: string[] };
  /** Aksi lain yang cukup masuk activity log (login, kelola event, kelola staff, dll.). */
  activity: {
    action: string;
    entityType: string;
    entityId?: string | null;
    registrationId?: string | null;
    description: string;
    metadata?: Record<string, unknown>;
  };
}

type Handler<K extends keyof EventMap> = (tx: Tx, payload: EventMap[K], meta: EventMeta) => Promise<void>;

const handlers: { [K in keyof EventMap]?: Handler<K>[] } = {};

export function on<K extends keyof EventMap>(name: K, handler: Handler<K>) {
  ((handlers[name] ??= []) as Handler<K>[]).push(handler);
}

/** Handler berjalan di transaksi pemanggil, jadi perubahan tidak tersimpan tanpa email dan log-nya. */
export async function emit<K extends keyof EventMap>(tx: Tx, name: K, payload: EventMap[K], meta: EventMeta) {
  for (const h of (handlers[name] ?? []) as Handler<K>[]) await h(tx, payload, meta);
}

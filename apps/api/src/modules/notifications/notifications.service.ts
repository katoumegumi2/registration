import { and, desc, eq, lte, sql, type SQL } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db, newId, paginate, type Tx } from "../../shared/db/client";
import { on } from "../../shared/events/bus";
import { settingsService, type EmailSettings } from "../settings";
import { notifications } from "./notifications.table";
import { templates, type Rendered } from "./notifications.templates";

const RETRY_MINUTES = [1, 5, 15];

export function createTransport(s: EmailSettings) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.security === "TLS",
    requireTLS: s.security === "STARTTLS",
    ignoreTLS: s.security === "NONE",
    auth: s.username ? { user: s.username, pass: s.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

const fromHeader = (s: EmailSettings) => (s.from_name ? `"${s.from_name.replace(/"/g, "")}" <${s.from_address}>` : s.from_address);

async function enqueue(tx: Tx, n: { type: string; recipient: string; participantId?: string; registrationId?: string; rendered: Rendered }) {
  await tx.insert(notifications).values({
    id: newId(),
    type: n.type,
    recipient: n.recipient,
    participantId: n.participantId ?? null,
    registrationId: n.registrationId ?? null,
    subject: n.rendered.subject,
    bodyHtml: n.rendered.html,
    bodyText: n.rendered.text,
  });
}

/** Modul ini hanya mendengarkan event; payload sudah membawa data email (PRD aturan 4). */
export function registerNotificationListeners() {
  on("otp.requested", async (tx, p) => {
    const app = await settingsService.getApp(tx);
    await enqueue(tx, { type: `OTP_${p.purpose}`, recipient: p.email, participantId: p.participantId, rendered: templates.otp(app, p) });
  });
  on("registration.submitted", async (tx, p) => {
    const app = await settingsService.getApp(tx);
    await enqueue(tx, { type: "REGISTRATION_RECEIPT", recipient: p.email, participantId: p.participantId, registrationId: p.registrationId, rendered: templates.submitted(app, p) });
  });
  on("registration.status_changed", async (tx, p) => {
    if (p.from === "DRAFT") return; // Submit sudah mengirim email bukti pendaftaran.
    const app = await settingsService.getApp(tx);
    await enqueue(tx, { type: "STATUS_CHANGED", recipient: p.email, participantId: p.participantId, registrationId: p.registrationId, rendered: templates.statusChanged(app, p) });
  });
  on("document.verified", async (tx, p) => {
    if (p.status !== "INVALID") return;
    const app = await settingsService.getApp(tx);
    await enqueue(tx, { type: "DOCUMENT_INVALID", recipient: p.email, participantId: p.participantId, registrationId: p.registrationId, rendered: templates.documentInvalid(app, p) });
  });
}

/** Mengirim baris yang jatuh tempo. SKIP LOCKED membuatnya aman walau worker lebih dari satu. */
export async function processDue(batch = 10): Promise<number> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(notifications)
      .where(and(eq(notifications.status, "PENDING"), lte(notifications.nextAttemptAt, new Date())))
      .orderBy(notifications.nextAttemptAt)
      .limit(batch)
      .for("update", { skipLocked: true });
    if (!due.length) return 0;
    const s = await settingsService.getEmail(tx);
    const transport = createTransport(s);
    for (const n of due) {
      try {
        await transport.sendMail({ from: fromHeader(s), replyTo: s.reply_to || undefined, to: n.recipient, subject: n.subject, html: n.bodyHtml, text: n.bodyText });
        await tx.update(notifications).set({ status: "SENT", sentAt: new Date(), attempts: n.attempts + 1, lastError: null }).where(eq(notifications.id, n.id));
      } catch (err) {
        // Percobaan pertama + 3 kali coba ulang dengan jeda 1, 5, 15 menit (PRD 10).
        const retryDelay = RETRY_MINUTES[n.attempts];
        await tx
          .update(notifications)
          .set({
            attempts: n.attempts + 1,
            lastError: String((err as Error).message).slice(0, 500),
            status: retryDelay === undefined ? "FAILED" : "PENDING",
            nextAttemptAt: new Date(Date.now() + (retryDelay ?? 0) * 60_000),
          })
          .where(eq(notifications.id, n.id));
      }
    }
    transport.close();
    return due.length;
  });
}

let workerActive = false;

/** Email OTP langsung memicu pengiriman bila worker berjalan di proses yang sama (PRD 10). */
export function kick() {
  if (workerActive) setTimeout(() => void processDue().catch(() => {}), 0);
}

export function markWorkerActive() {
  workerActive = true;
}

export async function sendTest(s: EmailSettings, to: string) {
  const app = await settingsService.getApp();
  const r = templates.test(app);
  const t = createTransport(s);
  try {
    await t.sendMail({ from: fromHeader(s), replyTo: s.reply_to || undefined, to, subject: r.subject, html: r.html, text: r.text });
  } finally {
    t.close();
  }
}

export async function list(f: { status?: string; page?: number }) {
  const where: SQL[] = [];
  if (f.status) where.push(eq(notifications.status, f.status as "PENDING"));
  const cond = where.length ? and(...where) : undefined;
  const { page, limit, offset } = paginate(f.page);
  const [rows, total] = await Promise.all([
    db
      .select({
        id: notifications.id, type: notifications.type, recipient: notifications.recipient, subject: notifications.subject,
        status: notifications.status, attempts: notifications.attempts, last_error: notifications.lastError,
        next_attempt_at: notifications.nextAttemptAt, sent_at: notifications.sentAt, created_at: notifications.createdAt,
      })
      .from(notifications)
      .where(cond)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(cond),
  ]);
  return { rows, total: total[0]!.n, page, page_size: limit };
}

export async function retry(tx: Tx, id: string) {
  const [row] = await tx
    .update(notifications)
    .set({ status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null })
    .where(and(eq(notifications.id, id), eq(notifications.status, "FAILED")))
    .returning({ id: notifications.id, recipient: notifications.recipient });
  return row ?? null;
}

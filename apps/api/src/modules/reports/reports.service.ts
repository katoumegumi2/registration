import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import ExcelJS from "exceljs";
import { maskNik, statusUsesSlot, type RegistrationStatus, type StaffRole } from "@pendaftaran/shared";
import { db, paginate } from "../../shared/db/client";
// Pengecualian rule 8: reports boleh membaca lintas tabel untuk agregasi, tidak pernah menulis.
import { documents } from "../documents/documents.table";
import { eventPrograms, events } from "../events/events.table";
import { notifications } from "../notifications/notifications.table";
import { participants } from "../participants/participants.table";
import { registrations } from "../registrations/registrations.table";

export interface RegistrationFilters {
  q?: string;
  event_id?: string;
  status?: RegistrationStatus;
  program_id?: string;
  from?: string;
  to?: string;
  page?: number;
}

function whereOf(f: RegistrationFilters): SQL {
  // Draft tidak terlihat di daftar admin (PRD 6.5).
  const where: SQL[] = [ne(registrations.status, "DRAFT")];
  if (f.event_id) where.push(eq(registrations.eventId, f.event_id));
  if (f.status) where.push(eq(registrations.status, f.status));
  if (f.program_id) where.push(eq(registrations.programId, f.program_id));
  if (f.from) where.push(gte(registrations.submittedAt, new Date(`${f.from}T00:00:00+07:00`)));
  if (f.to) where.push(lte(registrations.submittedAt, new Date(`${f.to}T23:59:59.999+07:00`)));
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(or(ilike(participants.fullName, like), ilike(participants.nik, like), ilike(participants.email, like), ilike(registrations.registrationNumber, like))!);
  }
  return and(...where)!;
}

const baseSelect = {
  id: registrations.id,
  registration_number: registrations.registrationNumber,
  status: registrations.status,
  submitted_at: registrations.submittedAt,
  verification_notes: registrations.verificationNotes,
  nik: participants.nik,
  full_name: participants.fullName,
  email: participants.email,
  phone: participants.phone,
  institution: participants.institution,
  event_id: events.id,
  event_name: events.name,
  program_name: eventPrograms.name,
};

const joined = () =>
  db
    .select(baseSelect)
    .from(registrations)
    .innerJoin(participants, eq(participants.id, registrations.participantId))
    .innerJoin(events, eq(events.id, registrations.eventId))
    .leftJoin(eventPrograms, eq(eventPrograms.id, registrations.programId));

export async function listRegistrations(f: RegistrationFilters) {
  const { page, limit, offset } = paginate(f.page);
  const cond = whereOf(f);
  const [rows, total] = await Promise.all([
    db
      .select({
        ...baseSelect,
        has_replaced_document: sql<boolean>`exists (select 1 from ${documents} where ${documents.registrationId} = ${registrations.id} and ${documents.replacedAt} is not null)`,
      })
      .from(registrations)
      .innerJoin(participants, eq(participants.id, registrations.participantId))
      .innerJoin(events, eq(events.id, registrations.eventId))
      .leftJoin(eventPrograms, eq(eventPrograms.id, registrations.programId))
      .where(cond)
      .orderBy(desc(registrations.submittedAt), desc(registrations.id))
      .limit(limit)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(registrations).innerJoin(participants, eq(participants.id, registrations.participantId)).where(cond),
  ]);
  return {
    // NIK tersamar di daftar (MP-01).
    rows: rows.map(({ nik, ...r }) => ({ ...r, nik_masked: maskNik(nik) })),
    total: total[0]!.n,
    page,
    page_size: limit,
  };
}

const wibDate = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(d) : "";

const EXPORT_HEADERS = ["Nomor", "NIK", "Nama", "Email", "No. HP", "Institusi", "Event", "Program", "Status", "Waktu Submit (WIB)", "Catatan"];

type ExportRow = Awaited<ReturnType<ReturnType<typeof joined>["where"]>>[number];

const exportCells = (r: ExportRow) => [r.registration_number ?? "", r.nik, r.full_name, r.email, r.phone, r.institution ?? "", r.event_name, r.program_name ?? "", r.status, wibDate(r.submitted_at), r.verification_notes ?? ""];

/** Sel yang diawali = + - @ bisa dieksekusi spreadsheet sebagai formula. */
function csvCell(v: string) {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function countForExport(f: RegistrationFilters) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(registrations).innerJoin(participants, eq(participants.id, registrations.participantId)).where(whereOf(f));
  return row!.n;
}

export function csvStream(f: RegistrationFilters): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const BATCH = 1000;
  let offset = 0;
  let started = false;
  return new ReadableStream({
    async pull(ctrl) {
      if (!started) {
        started = true;
        // BOM agar Excel membaca UTF-8 dengan benar.
        ctrl.enqueue(enc.encode(`﻿${EXPORT_HEADERS.join(",")}\r\n`));
      }
      const rows = await joined().where(whereOf(f)).orderBy(asc(registrations.submittedAt), asc(registrations.id)).limit(BATCH).offset(offset);
      if (!rows.length) return ctrl.close();
      offset += rows.length;
      ctrl.enqueue(enc.encode(rows.map((r) => exportCells(r).map(csvCell).join(",")).join("\r\n") + "\r\n"));
    },
  });
}

export async function xlsxBuffer(f: RegistrationFilters) {
  const rows = await joined().where(whereOf(f)).orderBy(asc(registrations.submittedAt), asc(registrations.id));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pendaftar");
  ws.addRow(EXPORT_HEADERS).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of rows) ws.addRow(exportCells(r));
  // NIK harus teks agar tidak berubah menjadi notasi ilmiah.
  ws.getColumn(2).numFmt = "@";
  ws.columns.forEach((col, i) => (col.width = [16, 20, 28, 28, 16, 24, 30, 24, 14, 20, 40][i]));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

// ---------- Dashboard ----------
export async function dashboard(eventId: string | undefined, role: StaffRole) {
  const scope: SQL = eventId ? and(ne(registrations.status, "DRAFT"), eq(registrations.eventId, eventId))! : ne(registrations.status, "DRAFT");
  const byStatus = await db.select({ status: registrations.status, n: sql<number>`count(*)::int` }).from(registrations).where(scope).groupBy(registrations.status);
  const scopeSql = eventId ? sql`and r.event_id = ${eventId}` : sql``;
  const daily = await db.execute<{ day: string; n: number }>(sql`
    select to_char(d, 'YYYY-MM-DD') as day, coalesce(c.n, 0)::int as n
    from generate_series((now() at time zone 'Asia/Jakarta')::date - 29, (now() at time zone 'Asia/Jakarta')::date, interval '1 day') d
    left join (
      select (r.submitted_at at time zone 'Asia/Jakarta')::date as day, count(*) as n
      from registrations r where r.status <> 'DRAFT' and r.submitted_at is not null ${scopeSql} group by 1
    ) c on c.day = d::date
    order by d`);
  const monthly = await db.execute<{ month: string; n: number }>(sql`
    select to_char(d, 'YYYY-MM') as month, coalesce(c.n, 0)::int as n
    from generate_series(date_trunc('month', now() at time zone 'Asia/Jakarta') - interval '11 months', date_trunc('month', now() at time zone 'Asia/Jakarta'), interval '1 month') d
    left join (
      select date_trunc('month', r.submitted_at at time zone 'Asia/Jakarta') as month, count(*) as n
      from registrations r where r.status <> 'DRAFT' and r.submitted_at is not null ${scopeSql} group by 1
    ) c on c.month = d
    order by d`);
  return {
    total: byStatus.reduce((a, r) => a + r.n, 0),
    by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
    daily: [...daily],
    monthly: [...monthly],
    quotas: await openEventQuotas(),
    queue: await queueRows(scope, "oldest"),
    recent: await queueRows(scope, "newest"),
    by_program: await topPrograms(scope),
    // Outbox hanya untuk admin (PRD 3); operator tidak menerima angka ini.
    failed_emails: role === "ADMIN" ? await failedEmails() : 0,
  };
}

/** Tanpa NIK dan email: dashboard hanya menampilkan yang perlu untuk bekerja. */
async function queueRows(scope: SQL, mode: "oldest" | "newest") {
  const base = db
    .select({
      id: registrations.id,
      registration_number: registrations.registrationNumber,
      status: registrations.status,
      submitted_at: registrations.submittedAt,
      full_name: participants.fullName,
      event_name: events.name,
      has_replaced_document: sql<boolean>`exists (select 1 from ${documents} where ${documents.registrationId} = ${registrations.id} and ${documents.replacedAt} is not null)`,
    })
    .from(registrations)
    .innerJoin(participants, eq(participants.id, registrations.participantId))
    .innerJoin(events, eq(events.id, registrations.eventId));
  if (mode === "oldest") {
    return base.where(and(scope, inArray(registrations.status, ["SUBMITTED", "UNDER_REVIEW"]))).orderBy(asc(registrations.submittedAt)).limit(6);
  }
  return base.where(scope).orderBy(desc(registrations.submittedAt)).limit(5);
}

async function topPrograms(scope: SQL) {
  return db
    .select({ program_id: eventPrograms.id, program: eventPrograms.name, n: sql<number>`count(*)::int` })
    .from(registrations)
    .innerJoin(eventPrograms, eq(eventPrograms.id, registrations.programId))
    .where(scope)
    .groupBy(eventPrograms.id, eventPrograms.name)
    .orderBy(desc(sql`count(*)`), asc(eventPrograms.name))
    .limit(5);
}

async function failedEmails() {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(eq(notifications.status, "FAILED"));
  return row!.n;
}

async function openEventQuotas() {
  const now = new Date();
  const rows = await db.select().from(events).where(and(eq(events.status, "PUBLISHED"), lte(events.startAt, now), gte(events.endAt, now))).orderBy(asc(events.endAt));
  return Promise.all(
    rows.map(async (e) => {
      const counts = await db.select({ status: registrations.status, n: sql<number>`count(*)::int` }).from(registrations).where(eq(registrations.eventId, e.id)).groupBy(registrations.status);
      const used = counts.filter((c) => statusUsesSlot(c.status, e.quotaMode)).reduce((a, c) => a + c.n, 0);
      const submitted = counts.filter((c) => c.status !== "DRAFT").reduce((a, c) => a + c.n, 0);
      return { event_id: e.id, name: e.name, quota_mode: e.quotaMode, quota: e.quota, used, submitted, end_at: e.endAt };
    }),
  );
}

// ---------- Laporan cetak ----------
export async function summary(eventId: string) {
  const [e] = await db.select().from(events).where(eq(events.id, eventId));
  if (!e) return null;
  const scope = and(eq(registrations.eventId, eventId), ne(registrations.status, "DRAFT"));
  const [byStatus, byProgram, byDay, list] = await Promise.all([
    db.select({ status: registrations.status, n: sql<number>`count(*)::int` }).from(registrations).where(scope).groupBy(registrations.status),
    db
      .select({ program: eventPrograms.name, n: sql<number>`count(*)::int` })
      .from(registrations)
      .leftJoin(eventPrograms, eq(eventPrograms.id, registrations.programId))
      .where(scope)
      .groupBy(eventPrograms.name)
      .orderBy(asc(eventPrograms.name)),
    db
      .select({ day: sql<string>`to_char(${registrations.submittedAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(registrations)
      .where(and(scope, isNotNull(registrations.submittedAt)))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    joined().where(scope).orderBy(asc(registrations.registrationNumber)),
  ]);
  return {
    event: { id: e.id, name: e.name, type: e.type, start_at: e.startAt, end_at: e.endAt, quota_mode: e.quotaMode, quota: e.quota },
    total: byStatus.reduce((a, r) => a + r.n, 0),
    by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
    by_program: byProgram,
    by_day: byDay,
    registrants: list.map(({ nik, ...r }) => ({ ...r, nik_masked: maskNik(nik) })),
  };
}

export async function eventOptions() {
  const rows = await db.select({ id: events.id, name: events.name, quota_mode: events.quotaMode }).from(events).orderBy(desc(events.createdAt));
  const programs = await db.select({ id: eventPrograms.id, name: eventPrograms.name, event_id: eventPrograms.eventId }).from(eventPrograms).orderBy(asc(eventPrograms.name));
  return rows.map((e) => ({ ...e, programs: programs.filter((p) => p.event_id === e.id).map((p) => ({ id: p.id, name: p.name })) }));
}

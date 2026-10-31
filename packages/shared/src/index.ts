import { z } from "zod";

// ---------- Enum ----------
export const REGISTRATION_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WAITING_LIST"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const EVENT_TYPES = ["PMB", "PELATIHAN", "SEMINAR", "KEGIATAN"] as const;
export const QUOTA_MODES = ["FCFS", "SELECTION"] as const;
export type QuotaMode = (typeof QUOTA_MODES)[number];
export const EVENT_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"] as const;
export const STAFF_ROLES = ["ADMIN", "OPERATOR"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const VERIFICATION_STATUSES = ["PENDING", "VALID", "INVALID"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

// ---------- Transisi status (PRD 6.5) ----------
export type TransitionActor = "PARTICIPANT" | "STAFF" | "ADMIN";
export interface TransitionRule {
  from: RegistrationStatus;
  to: RegistrationStatus;
  by: TransitionActor;
  notesRequired?: boolean;
  requiresValidDocuments?: boolean;
  selectionOnly?: boolean;
  /** Kuota dicek pada mode ini saat transisi. */
  quotaCheck?: QuotaMode;
}

export const TRANSITIONS: readonly TransitionRule[] = [
  { from: "DRAFT", to: "SUBMITTED", by: "PARTICIPANT", quotaCheck: "FCFS" },
  { from: "SUBMITTED", to: "UNDER_REVIEW", by: "STAFF" },
  { from: "UNDER_REVIEW", to: "ACCEPTED", by: "STAFF", requiresValidDocuments: true, quotaCheck: "SELECTION" },
  { from: "UNDER_REVIEW", to: "REJECTED", by: "STAFF", notesRequired: true },
  { from: "UNDER_REVIEW", to: "WAITING_LIST", by: "STAFF", selectionOnly: true, requiresValidDocuments: true },
  { from: "WAITING_LIST", to: "ACCEPTED", by: "STAFF", requiresValidDocuments: true, quotaCheck: "SELECTION" },
  { from: "WAITING_LIST", to: "REJECTED", by: "STAFF", notesRequired: true },
  { from: "ACCEPTED", to: "UNDER_REVIEW", by: "ADMIN", notesRequired: true },
  { from: "REJECTED", to: "UNDER_REVIEW", by: "ADMIN", notesRequired: true, quotaCheck: "FCFS" },
];

export function findTransition(from: RegistrationStatus, to: RegistrationStatus): TransitionRule | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export function nextTransitions(from: RegistrationStatus, mode: QuotaMode): TransitionRule[] {
  return TRANSITIONS.filter((t) => t.from === from && t.by !== "PARTICIPANT" && (!t.selectionOnly || mode === "SELECTION"));
}

/** Slot terpakai dihitung dari status ini (PRD 6.2). */
export function statusUsesSlot(status: RegistrationStatus, mode: QuotaMode): boolean {
  return mode === "FCFS" ? status !== "DRAFT" && status !== "REJECTED" : status === "ACCEPTED";
}

/** Apakah file boleh diganti pada status ini (PRD 6.6). */
export function canReplaceDocument(status: RegistrationStatus, verification: VerificationStatus | null): boolean {
  if (status === "DRAFT" || status === "SUBMITTED") return true;
  if (status === "UNDER_REVIEW" || status === "WAITING_LIST") return verification === "INVALID";
  return false;
}

export function canVerifyDocument(status: RegistrationStatus): boolean {
  return status === "UNDER_REVIEW" || status === "WAITING_LIST";
}

// ---------- Aturan berkas ----------
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];

export type DetectedFile = { ext: "pdf" | "doc" | "docx" | "jpg" | "png"; mime: string };

/** Mendeteksi jenis file dari isi (PRD 6.6), bukan dari nama atau Content-Type. */
export function detectFileType(b: Uint8Array): DetectedFile | null {
  const starts = (sig: number[]) => sig.every((v, i) => b[i] === v);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return { ext: "pdf", mime: "application/pdf" };
  if (starts([0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" };
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", mime: "image/png" };
  if (starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { ext: "doc", mime: "application/msword" };
  if (starts([0x50, 0x4b, 0x03, 0x04]) && containsAscii(b, "[Content_Types].xml")) {
    return { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  return null;
}

function containsAscii(b: Uint8Array, text: string): boolean {
  const first = text.charCodeAt(0);
  outer: for (let i = 0; i <= b.length - text.length; i++) {
    if (b[i] !== first) continue;
    for (let j = 1; j < text.length; j++) if (b[i + j] !== text.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

// ---------- Helper tampilan ----------
export function maskNik(nik: string): string {
  return nik.length < 8 ? nik : `${nik.slice(0, 4)}${"*".repeat(nik.length - 8)}${nik.slice(-4)}`;
}

export const STATUS_LABELS: Record<RegistrationStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WAITING_LIST: "Waiting List",
};

// ---------- Skema validasi ----------
export const nikSchema = z.string().regex(/^\d{16}$/, "NIK harus 16 digit angka");
export const emailSchema = z.string().trim().toLowerCase().email("Format email tidak valid").max(200);
export const passwordSchema = z.string().min(8, "Password minimal 8 karakter").max(200);
export const phoneSchema = z.string().trim().regex(/^[0-9+][0-9 -]{7,19}$/, "Nomor HP tidak valid");
export const otpSchema = z.string().regex(/^\d{6}$/, "Kode OTP harus 6 digit");
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Nama wajib diisi").max(150),
  gender: z.enum(["L", "P"]),
  birth_place: z.string().trim().min(1, "Tempat lahir wajib diisi").max(100),
  birth_date: dateOnlySchema,
  phone: phoneSchema,
  address: z.string().trim().min(1, "Alamat wajib diisi").max(500),
  institution: z.string().trim().max(150).optional().nullable(),
  education_level: z.string().trim().max(50).optional().nullable(),
});

export const registerSchema = profileSchema.extend({
  nik: nikSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const eventInputSchema = z
  .object({
    name: z.string().trim().min(3).max(200),
    slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Slug hanya huruf kecil, angka, dan tanda hubung").max(120).optional(),
    type: z.enum(EVENT_TYPES),
    description: z.string().trim().max(5000).default(""),
    registration_prefix: z.string().regex(/^[A-Z]{2,5}$/, "Prefix 2–5 huruf kapital"),
    start_at: z.string().datetime({ offset: true }),
    end_at: z.string().datetime({ offset: true }),
    quota_mode: z.enum(QUOTA_MODES),
    quota: z.number().int().min(0).nullable().default(null),
    requires_program: z.boolean().default(false),
    status: z.enum(EVENT_STATUSES).default("DRAFT"),
  })
  .refine((v) => new Date(v.end_at) > new Date(v.start_at), { path: ["end_at"], message: "Waktu selesai harus setelah waktu mulai" });

export const API_ERROR_CODES = [
  "VALIDATION_ERROR", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "RATE_LIMITED", "CONFLICT",
  "QUOTA_FULL", "DUPLICATE_NIK", "DUPLICATE_EMAIL", "INVALID_TRANSITION", "EMAIL_NOT_VERIFIED",
  "INVALID_CREDENTIALS", "INVALID_OTP", "EVENT_CLOSED", "DOCUMENTS_INCOMPLETE", "DOCUMENTS_NOT_VALID",
  "PROGRAM_REQUIRED", "NOTES_REQUIRED", "FILE_REJECTED", "FILE_LOCKED", "EVENT_LOCKED", "ACCOUNT_SUSPENDED",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

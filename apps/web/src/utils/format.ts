const dateTime = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });
const dateOnly = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

/** Format `31 Okt 2026, 14.05 WIB` (PRD 9). */
export function formatTanggalWIB(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const p = Object.fromEntries(dateTime.formatToParts(new Date(v)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}.${p.minute} WIB`;
}

export function formatTanggal(v: string | Date | null | undefined): string {
  return v ? dateOnly.format(new Date(v)) : "—";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Nilai untuk <input type="datetime-local"> dalam WIB. */
export function toWibInput(v: string | null | undefined): string {
  if (!v) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).formatToParts(new Date(v)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

export const fromWibInput = (v: string) => new Date(`${v}:00+07:00`).toISOString();

export const EVENT_TYPE_LABELS: Record<string, string> = { PMB: "PMB", PELATIHAN: "Pelatihan", SEMINAR: "Seminar", KEGIATAN: "Kegiatan" };
export const VERIFICATION_LABELS: Record<string, string> = { PENDING: "Menunggu", VALID: "Valid", INVALID: "Tidak valid" };

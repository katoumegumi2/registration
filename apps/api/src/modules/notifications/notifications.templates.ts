import { STATUS_LABELS, type RegistrationStatus } from "@pendaftaran/shared";
import type { AppSettings } from "../settings";

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function formatWib(d: Date): string {
  const parts = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(d);
  return `${parts.replace(/\bpukul\s*/i, "").replace(/(\d{2})[:.](\d{2})/, "$1.$2")} WIB`;
}

/** Semua email memuat langkah cek status tertulis, karena server demo ada di jaringan lokal (PRD 10). */
function layout(app: AppSettings, subject: string, lines: string[]): Rendered {
  const footer = [
    `Cek status: buka ${app.base_url}, masuk dengan akun Anda, lalu pilih menu Pendaftaran Saya.`,
    app.contact_email ? `Kontak panitia: ${app.contact_email}` : "",
  ].filter(Boolean);
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#142D4E">
<h2 style="color:#142D4E">${esc(app.app_name)}</h2>
${lines.map((l) => `<p>${esc(l)}</p>`).join("\n")}
<hr style="border:none;border-top:1px solid #e2e8f0">
${footer.map((l) => `<p style="font-size:13px;color:#475569">${esc(l)}</p>`).join("\n")}
</div>`;
  return { subject: `[${app.app_name}] ${subject}`, html, text: [...lines, "", ...footer].join("\n") };
}

const OTP_SUBJECT: Record<string, string> = {
  VERIFY_EMAIL: "Kode verifikasi email",
  RESET_PASSWORD: "Kode reset password",
  CHANGE_EMAIL: "Kode konfirmasi email baru",
};

export const templates = {
  otp: (app: AppSettings, p: { name: string; purpose: string; code: string }) =>
    layout(app, OTP_SUBJECT[p.purpose] ?? "Kode OTP", [`Halo ${p.name},`, `Kode OTP Anda: ${p.code}`, "Kode berlaku 10 menit. Jangan berikan kode ini kepada siapa pun."]),

  submitted: (app: AppSettings, p: { name: string; number: string | null; eventName: string; programName: string | null; submittedAt: Date }) =>
    layout(app, `Bukti pendaftaran ${p.number}`, [
      `Halo ${p.name},`,
      "Pendaftaran Anda sudah kami terima.",
      `Nomor registrasi: ${p.number}`,
      `Event: ${p.eventName}`,
      ...(p.programName ? [`Program: ${p.programName}`] : []),
      `Waktu submit: ${formatWib(p.submittedAt)}`,
    ]),

  statusChanged: (app: AppSettings, p: { name: string; number: string | null; eventName: string; to: RegistrationStatus; notes: string | null }) =>
    layout(app, `Status pendaftaran ${p.number}: ${STATUS_LABELS[p.to]}`, [
      `Halo ${p.name},`,
      `Status pendaftaran ${p.number} untuk ${p.eventName} sekarang: ${STATUS_LABELS[p.to]}.`,
      ...(p.notes ? [`Catatan panitia: ${p.notes}`] : []),
    ]),

  documentInvalid: (app: AppSettings, p: { name: string; number: string | null; eventName: string; documentName: string; notes: string | null }) =>
    layout(app, `Berkas perlu diganti: ${p.documentName}`, [
      `Halo ${p.name},`,
      `Berkas ${p.documentName} pada pendaftaran ${p.number} (${p.eventName}) perlu diganti.`,
      ...(p.notes ? [`Catatan panitia: ${p.notes}`] : []),
      "Silakan masuk lalu unggah berkas pengganti di halaman pendaftaran Anda.",
    ]),

  test: (app: AppSettings) => layout(app, "Email uji", ["Ini email uji dari halaman pengaturan. Pengaturan SMTP berfungsi."]),
};

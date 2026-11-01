<script setup lang="ts">
import type { RegistrationStatus } from "@pendaftaran/shared";
import { computed } from "vue";
import { formatTanggalWIB } from "@/utils/format";

const props = defineProps<{ registration: any }>();

type StepState = "done" | "current" | "todo" | "accepted" | "rejected" | "waiting";

const status = computed<RegistrationStatus>(() => props.registration.status);

/** Waktu terakhir pendaftaran mencapai status ini, dari riwayat status. */
function reachedAt(...statuses: RegistrationStatus[]): string | null {
  const rows = (props.registration.history ?? []).filter((h: any) => statuses.includes(h.to_status));
  return rows.length ? rows[rows.length - 1].changed_at : null;
}

const POSITION: Record<RegistrationStatus, number> = { DRAFT: 0, SUBMITTED: 1, UNDER_REVIEW: 2, ACCEPTED: 3, REJECTED: 3, WAITING_LIST: 3 };

const steps = computed(() => {
  const pos = POSITION[status.value];
  const state = (i: number): StepState => (i < pos ? "done" : i === pos ? "current" : "todo");
  const result: { label: string; state: StepState } =
    status.value === "ACCEPTED" ? { label: "Diterima", state: "accepted" }
    : status.value === "REJECTED" ? { label: "Ditolak", state: "rejected" }
    : status.value === "WAITING_LIST" ? { label: "Daftar tunggu", state: "waiting" }
    : { label: "Hasil", state: "todo" };
  return [
    { label: "Lengkapi berkas", state: state(0), at: null },
    { label: "Terkirim", state: state(1), at: reachedAt("SUBMITTED") },
    { label: "Ditinjau panitia", state: state(2), at: reachedAt("UNDER_REVIEW") },
    { label: result.label, state: result.state, at: pos === 3 ? reachedAt(status.value) : null },
  ];
});

const ICONS: Record<StepState, string> = { done: "fa-check", current: "fa-circle", todo: "fa-circle", accepted: "fa-check", rejected: "fa-xmark", waiting: "fa-clock" };
const CIRCLE: Record<StepState, string> = {
  done: "bg-forest text-white",
  current: "bg-lime text-ink ring-4 ring-lime/30",
  todo: "bg-slate-100 text-slate-300",
  accepted: "bg-green-700 text-white ring-4 ring-green-700/20",
  rejected: "bg-red-700 text-white ring-4 ring-red-700/20",
  waiting: "bg-purple-700 text-white ring-4 ring-purple-700/20",
};
const isActive = (s: StepState) => s !== "done" && s !== "todo";

/** Satu kalimat: apa yang terjadi sekarang dan apa yang perlu dilakukan peserta. */
const invalidDocs = computed(() => (props.registration.documents ?? []).filter((d: any) => d.verification_status === "INVALID"));
const hint = computed(() => {
  if (invalidDocs.value.length && (status.value === "UNDER_REVIEW" || status.value === "WAITING_LIST")) {
    return { text: `Panitia meminta ${invalidDocs.value.length} dokumen diganti. Unggah penggantinya agar bisa diproses.`, action: true };
  }
  switch (status.value) {
    case "DRAFT": return { text: "Pendaftaran belum terkirim. Lengkapi berkas lalu kirim sebelum periode ditutup.", action: true };
    case "SUBMITTED": return { text: "Pendaftaran sudah diterima dan menunggu ditinjau panitia. Berkas masih bisa diganti.", action: false };
    case "UNDER_REVIEW": return { text: "Panitia sedang memeriksa berkas Anda. Hasilnya dikabarkan lewat email.", action: false };
    case "WAITING_LIST": return { text: "Berkas Anda lolos, tetapi kuota sudah penuh. Anda dikabari bila ada kuota.", action: false };
    case "ACCEPTED": return { text: "Selamat, pendaftaran Anda diterima.", action: false };
    default: return { text: "Pendaftaran Anda belum dapat diterima. Lihat catatan panitia.", action: false };
  }
});
</script>

<template>
  <div class="no-print">
    <ol class="grid gap-3 sm:grid-cols-4 sm:gap-0">
      <li v-for="(s, i) in steps" :key="s.label" class="relative flex items-start gap-3 sm:block" :aria-current="isActive(s.state) ? 'step' : undefined">
        <!-- Garis penghubung: mendatar di layar lebar, menurun di HP -->
        <span v-if="i < steps.length - 1" class="absolute top-8 bottom-[-0.75rem] left-[0.9375rem] w-0.5 sm:top-[0.9375rem] sm:right-0 sm:bottom-auto sm:left-8 sm:h-0.5 sm:w-auto" :class="s.state === 'done' ? 'bg-forest' : 'bg-slate-200'" aria-hidden="true" />
        <span class="relative flex size-8 shrink-0 items-center justify-center rounded-full text-xs" :class="CIRCLE[s.state]">
          <i class="fa-solid" :class="[ICONS[s.state], s.state === 'current' || s.state === 'todo' ? 'text-[0.5rem]' : '']" aria-hidden="true" />
        </span>
        <span class="block pt-1 sm:pt-2 sm:pr-3">
          <span class="block text-sm" :class="s.state === 'todo' ? 'text-slate-500' : 'font-medium text-ink'">{{ s.label }}</span>
          <span v-if="s.at" class="block text-xs text-slate-500">{{ formatTanggalWIB(s.at) }}</span>
        </span>
      </li>
    </ol>
    <p class="mt-3 flex items-start gap-2 rounded-2xl px-3 py-2 text-sm" :class="hint.action ? 'bg-primary-light font-medium text-ink' : 'bg-background text-slate-700'">
      <i class="fa-solid mt-0.5" :class="hint.action ? 'fa-hand-point-right text-forest' : 'fa-circle-info text-slate-500'" aria-hidden="true" />
      <span>{{ hint.text }}</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import { api, errorMessage } from "@/composables/useApi";
import { EVENT_TYPE_LABELS, formatTanggal } from "@/utils/format";
import EventCard from "./EventCard.vue";

const events = ref<any[]>([]);
const loading = ref(true);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    events.value = await api.get("/events");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// Isi visual hero diambil dari event sungguhan, bukan data contoh.
const openEvents = computed(() => events.value.filter((e) => e.is_open));
const first = computed(() => openEvents.value[0] ?? null);
const second = computed(() => openEvents.value[1] ?? null);
const quotaText = (e: any) => (e.quota_mode === "SELECTION" ? "Seleksi" : e.remaining === null ? "Tanpa batas kuota" : `Sisa kuota ${e.remaining}`);

const chips = ["PMB", "Pelatihan", "Seminar", "Kegiatan", "Unggah Berkas", "Cek Status"];
const steps = [
  { icon: "fa-user-plus", title: "Buat akun.", text: "Isi data diri sekali, lalu verifikasi email dengan kode OTP." },
  { icon: "fa-calendar-check", title: "Pilih event.", text: "Lihat jadwal, kuota, dan syarat dokumen setiap event." },
  { icon: "fa-file-arrow-up", title: "Unggah berkas.", text: "Kirim dokumen dan dapatkan nomor registrasi otomatis." },
  { icon: "fa-bell", title: "Pantau status.", text: "Hasil verifikasi dikabarkan lewat email dan Pendaftaran Saya." },
];
</script>

<template>
  <!-- Hero -->
  <section class="mx-auto grid max-w-6xl items-center gap-8 px-4 pt-6 pb-14 lg:grid-cols-2">
    <div>
      <h1 class="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">Satu Akun untuk <span class="text-chart">Semua Pendaftaran</span></h1>
      <p class="mt-4 max-w-lg text-slate-700">Buat akun sekali, lalu daftar ke event mana pun yang dibuka, unggah berkas, dan pantau statusnya dari satu tempat.</p>
      <div class="mt-6 flex flex-wrap items-center gap-4">
        <a href="#event" class="rounded-full bg-lime px-6 py-3 text-sm font-medium text-ink hover:bg-lime-dark">Lihat Event</a>
        <RouterLink to="/register" class="group flex items-center gap-2 text-sm font-medium">
          <span class="flex size-10 items-center justify-center rounded-full bg-forest text-lime"><i class="fa-solid fa-user-plus" aria-hidden="true" /></span>
          Daftar Akun
        </RouterLink>
      </div>
      <div class="mt-8 max-w-md border-t border-ink/40 pt-5">
        <ul class="flex flex-wrap gap-2 text-xs">
          <li v-for="c in chips" :key="c" class="rounded-full border border-ink/50 px-3 py-1">{{ c }}</li>
        </ul>
      </div>
    </div>

    <div class="relative h-[27rem] overflow-hidden sm:h-[28rem]" aria-hidden="true">
      <div class="absolute top-1/2 left-1/2 size-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-chart/40 sm:size-[27rem]" />
      <div class="absolute top-1/2 left-1/2 size-[17rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-chart/50 sm:size-[20rem]" />
      <div class="gradient-green absolute top-16 right-2 w-64 sm:top-10 rounded-3xl p-5 text-ink shadow-lg sm:right-6 sm:w-80">
        <p class="text-xs">Event dibuka</p>
        <p class="mt-1 line-clamp-2 text-lg leading-snug font-semibold">{{ first?.name ?? "Segera dibuka" }}</p>
        <div v-if="first" class="mt-6 flex justify-between gap-3 text-xs">
          <div><p class="opacity-70">Ditutup</p><p class="font-medium">{{ formatTanggal(first.end_at) }}</p></div>
          <div class="text-right"><p class="opacity-70">Kuota</p><p class="font-medium">{{ quotaText(first) }}</p></div>
        </div>
      </div>
      <div class="gradient-teal absolute bottom-3 left-2 w-64 sm:bottom-10 rounded-3xl p-5 text-white shadow-xl sm:left-6 sm:w-80">
        <p class="text-xs text-white/80">{{ second ? EVENT_TYPE_LABELS[second.type] : "Pendaftaran" }}</p>
        <p class="mt-1 line-clamp-2 text-lg leading-snug font-semibold">{{ second?.name ?? "Pantau status kapan saja" }}</p>
        <div v-if="second" class="mt-6 flex justify-between gap-3 text-xs">
          <div><p class="text-white/70">Ditutup</p><p class="font-medium">{{ formatTanggal(second.end_at) }}</p></div>
          <div class="text-right"><p class="text-white/70">Kuota</p><p class="font-medium">{{ quotaText(second) }}</p></div>
        </div>
      </div>
      <div class="absolute top-0 right-4 rounded-2xl bg-white px-4 py-2 shadow-md sm:top-2 sm:right-auto sm:left-10 sm:py-3">
        <p class="text-xs text-slate-600">Event dibuka</p>
        <p class="text-2xl font-semibold">{{ openEvents.length }}</p>
      </div>
      <div class="absolute right-1 bottom-4 flex size-12 sm:right-8 sm:bottom-16 items-center justify-center rounded-full bg-lime text-ink shadow-md"><i class="fa-solid fa-clipboard-check" /></div>
    </div>
  </section>

  <!-- Event -->
  <section id="event" class="mx-auto max-w-6xl scroll-mt-4 px-4 pb-16">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <span class="rounded-full bg-forest px-4 py-1.5 text-sm text-white">Event</span>
      <p class="text-sm">Daftar sekali, pantau di satu tempat.</p>
    </div>
    <h2 class="mt-5 max-w-3xl text-2xl leading-snug font-medium tracking-tight sm:text-3xl">Pilih <span class="text-chart">event yang dibuka</span> lalu kirim berkas Anda secara online, dengan kuota dan <span class="text-teal">status pendaftaran</span> yang selalu terbaru.</h2>
    <div class="mt-8">
      <AsyncState :loading="loading" :error="error" :empty="!events.length" empty-text="Belum ada event yang dibuka." @retry="load">
        <div class="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-4">
          <EventCard v-for="(e, i) in events" :key="e.id" :event="e" :index="i" />
        </div>
      </AsyncState>
    </div>
  </section>

  <!-- Langkah -->
  <section class="relative overflow-hidden bg-lime">
    <div class="pointer-events-none absolute -bottom-10 left-0 w-full text-center text-[22vw] leading-none font-bold whitespace-nowrap text-chart/25 select-none" aria-hidden="true">DAFTAR</div>
    <div class="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 lg:grid-cols-2">
      <div class="rounded-[2rem] bg-ink p-6 text-white shadow-xl sm:p-7">
        <span class="inline-flex items-center gap-2 rounded-full border border-white/30 px-3 py-1.5 text-sm"><i class="fa-solid fa-calendar-days text-lime" aria-hidden="true" />Event dibuka</span>
        <p class="mt-10 text-sm text-white/70">Sedang menerima pendaftaran</p>
        <p class="text-4xl font-semibold">{{ openEvents.length }} event</p>
        <div class="mt-6 flex flex-wrap items-center gap-2 text-sm">
          <RouterLink to="/register" class="rounded-full border border-white/30 px-4 py-2 hover:bg-white/10"><i class="fa-solid fa-user-plus mr-2" aria-hidden="true" />Daftar Akun</RouterLink>
          <RouterLink to="/login" class="rounded-full border border-white/30 px-4 py-2 hover:bg-white/10"><i class="fa-solid fa-right-to-bracket mr-2" aria-hidden="true" />Masuk</RouterLink>
          <a href="#event" class="flex size-10 items-center justify-center rounded-full bg-lime text-ink" aria-label="Lihat event"><i class="fa-solid fa-arrow-up" aria-hidden="true" /></a>
        </div>
      </div>
      <div>
        <h2 class="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">Mulai Mendaftar dalam 4 Langkah Mudah</h2>
        <ol class="mt-6 space-y-4">
          <li v-for="s in steps" :key="s.title" class="flex items-start gap-3 text-sm">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-forest text-lime"><i class="fa-solid" :class="s.icon" aria-hidden="true" /></span>
            <p class="pt-0.5"><strong class="font-semibold">{{ s.title }}</strong> {{ s.text }}</p>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

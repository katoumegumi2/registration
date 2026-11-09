<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import { api, errorMessage } from "@/composables/useApi";
import { EVENT_TYPE_LABELS, formatTanggal } from "@/utils/format";
import EventCard from "./EventCard.vue";

/*
 * Tata letak mengikuti referensi desain landing page "Creatix" (lihat README, bagian Referensi desain):
 * kartu hero putih di atas latar gelap, baris statistik, daftar bernomor, teks besar, dan footer lime.
 * Isinya tetap data sungguhan dari API, bukan konten contoh.
 */

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

const openEvents = computed(() => events.value.filter((e) => e.is_open));
const first = computed(() => openEvents.value[0] ?? null);
const second = computed(() => openEvents.value[1] ?? null);
const quotaText = (e: any) => (e.quota_mode === "SELECTION" ? "Seleksi" : e.remaining === null ? "Tanpa batas kuota" : `Sisa kuota ${e.remaining}`);

// Sisa kuota hanya dijumlah dari event yang kuotanya terbatas; event seleksi dan tanpa batas tidak ikut.
const remainingTotal = computed(() => {
  const limited = openEvents.value.filter((e) => e.quota_mode !== "SELECTION" && e.remaining !== null);
  return limited.length ? limited.reduce((n, e) => n + e.remaining, 0) : null;
});
const stats = computed(() => [
  { value: String(openEvents.value.length), label: "Event dibuka" },
  { value: String(new Set(openEvents.value.map((e) => e.type)).size), label: "Jenis event" },
  { value: remainingTotal.value === null ? "—" : String(remainingTotal.value), label: "Sisa kuota terbatas" },
  { value: "4", label: "Langkah mendaftar" },
]);

const steps = [
  { icon: "fa-user-plus", title: "Buat akun", text: "Isi data diri sekali, lalu verifikasi email dengan kode OTP. Akun yang sama dipakai untuk semua event." },
  { icon: "fa-calendar-check", title: "Pilih event", text: "Lihat jadwal, kuota, dan syarat dokumen setiap event sebelum mendaftar." },
  { icon: "fa-file-arrow-up", title: "Unggah berkas", text: "Kirim dokumen yang diminta dan dapatkan nomor registrasi otomatis." },
  { icon: "fa-bell", title: "Pantau status", text: "Hasil verifikasi panitia dikabarkan lewat email dan halaman Pendaftaran Saya." },
];
const activeStep = ref(0);
const step = computed(() => steps[activeStep.value]);
</script>

<template>
  <!-- Hero: menyambung dengan header putih di PublicLayout -->
  <section class="relative mx-2 overflow-hidden rounded-b-[2.5rem] bg-white text-ink sm:mx-3">
    <div class="relative mx-auto max-w-6xl px-4 pt-10 sm:pt-14">
      <svg class="absolute top-6 left-4 hidden size-20 text-lime-dark sm:block" viewBox="0 0 100 100" aria-hidden="true">
        <g stroke="currentColor" stroke-width="5" stroke-linecap="round">
          <line v-for="a in 12" :key="a" x1="50" y1="50" x2="50" y2="6" :transform="`rotate(${a * 30} 50 50)`" />
        </g>
      </svg>
      <h1 class="relative mx-auto max-w-3xl text-center text-4xl leading-tight font-semibold tracking-tight sm:text-6xl">
        Satu Akun untuk Semua Pendaftaran
        <svg class="absolute -right-2 -bottom-1 hidden h-8 w-10 text-lime-dark sm:block" viewBox="0 0 40 32" fill="none" aria-hidden="true">
          <path d="M4 16 L30 6 M4 16 L34 18 M4 16 L28 28" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        </svg>
      </h1>

      <div class="mt-8 grid items-end gap-6 lg:grid-cols-[1fr_minmax(0,26rem)_1fr]">
        <div class="text-center lg:pb-24 lg:text-left">
          <p class="mx-auto max-w-xs text-sm text-slate-600 lg:mx-0">Buat akun sekali, lalu daftar ke event mana pun yang dibuka, unggah berkas, dan pantau statusnya dari satu tempat.</p>
          <a href="#langkah" class="mt-4 inline-flex rounded-full border border-ink/40 px-4 py-2 text-xs font-medium hover:bg-ink hover:text-white">Lihat cara mendaftar</a>
        </div>

        <!-- Visual tengah: kartu event sungguhan di dalam lingkaran -->
        <div class="relative mx-auto h-[25rem] w-full max-w-[26rem]">
          <div class="absolute bottom-0 left-1/2 size-[20rem] -translate-x-1/2 translate-y-1/4 rounded-full bg-background sm:size-[24rem]" aria-hidden="true" />
          <div class="absolute bottom-0 left-1/2 size-[24rem] -translate-x-1/2 translate-y-1/4 rounded-full border border-ink/10 sm:size-[28rem]" aria-hidden="true" />
          <div class="gradient-green absolute top-6 left-1/2 w-64 -translate-x-1/2 -rotate-3 rounded-3xl p-5 text-ink shadow-xl sm:w-72">
            <p class="text-xs">Event dibuka</p>
            <p class="mt-1 line-clamp-2 text-lg leading-snug font-semibold">{{ first?.name ?? "Segera dibuka" }}</p>
            <div v-if="first" class="mt-5 flex justify-between gap-3 text-xs">
              <div><p class="opacity-70">Ditutup</p><p class="font-medium">{{ formatTanggal(first.end_at) }}</p></div>
              <div class="text-right"><p class="opacity-70">Kuota</p><p class="font-medium">{{ quotaText(first) }}</p></div>
            </div>
          </div>
          <div class="gradient-teal absolute top-52 left-1/2 w-60 -translate-x-[40%] rotate-2 rounded-3xl p-5 text-white shadow-xl sm:w-64">
            <p class="text-xs text-white/80">{{ second ? EVENT_TYPE_LABELS[second.type] : "Pendaftaran" }}</p>
            <p class="mt-1 line-clamp-2 leading-snug font-semibold">{{ second?.name ?? "Pantau status kapan saja" }}</p>
          </div>
          <div class="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-ink/90 p-1.5 text-xs whitespace-nowrap shadow-lg">
            <a href="#event" class="rounded-full bg-lime px-4 py-2 font-medium text-ink hover:bg-lime-dark">Lihat Event</a>
            <RouterLink to="/register" class="rounded-full px-4 py-2 text-white hover:bg-white/10">Daftar Akun</RouterLink>
          </div>
        </div>

        <div class="hidden pb-24 text-right lg:block">
          <p class="flex justify-end gap-1 text-xs text-lime-dark" aria-hidden="true"><i v-for="n in 5" :key="n" class="fa-solid fa-circle-check" /></p>
          <p class="mt-2 text-3xl font-semibold">{{ openEvents.length }} Event</p>
          <p class="text-xs text-slate-600">sedang menerima pendaftaran</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Statistik -->
  <section class="mx-auto max-w-6xl px-4 pt-10">
    <dl class="grid grid-cols-2 gap-y-6 rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-6 sm:grid-cols-4">
      <div v-for="s in stats" :key="s.label" class="flex flex-col-reverse text-center">
        <dt class="text-xs text-white/60">{{ s.label }}</dt>
        <dd class="text-3xl font-semibold">{{ s.value }}</dd>
      </div>
    </dl>
  </section>

  <!-- Event -->
  <section id="event" class="mx-auto max-w-6xl scroll-mt-4 px-4 pt-16">
    <div class="grid gap-4 md:grid-cols-2 md:items-end">
      <h2 class="relative text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
        <i class="fa-solid fa-star-of-life absolute -top-5 -left-1 text-sm text-lime" aria-hidden="true" />
        Pilih Event yang <br class="hidden sm:block" />Sedang Dibuka
      </h2>
      <p class="text-sm text-white/60 md:justify-self-end md:max-w-sm">Kirim berkas Anda secara online, dengan kuota dan status pendaftaran yang selalu terbaru. Daftar sekali, pantau di satu tempat.</p>
    </div>
    <div class="mt-8">
      <AsyncState :loading="loading" :error="error" :empty="!events.length" empty-text="Belum ada event yang dibuka." @retry="load">
        <div class="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-4">
          <EventCard v-for="(e, i) in events" :key="e.id" :event="e" :index="i" />
        </div>
      </AsyncState>
    </div>
  </section>

  <!-- Cara mendaftar -->
  <section id="langkah" class="mx-auto max-w-6xl scroll-mt-4 px-4 pt-16">
    <div class="relative overflow-hidden rounded-[2rem] bg-white/[0.04] p-6 pl-12 sm:p-8 sm:pl-16">
      <span class="absolute top-8 left-0 rounded-r-lg bg-lime px-1.5 py-3 text-[0.65rem] font-semibold tracking-widest text-ink uppercase [writing-mode:vertical-rl]" aria-hidden="true">Cara daftar</span>
      <h2 class="text-3xl font-semibold tracking-tight">Cara <span class="rounded-lg bg-lime px-2 text-ink">Mendaftar</span></h2>
      <p class="mt-2 max-w-md text-sm text-white/60">Empat langkah dari membuat akun sampai menerima hasil verifikasi panitia.</p>

      <div class="mt-6 grid gap-4 lg:grid-cols-[1fr_1.1fr_0.8fr]">
        <ol class="space-y-3" role="tablist" aria-label="Langkah pendaftaran">
          <li v-for="(s, i) in steps" :key="s.title">
            <button
              :id="`langkah-tab-${i}`"
              role="tab"
              :aria-selected="activeStep === i"
              aria-controls="langkah-panel"
              class="flex w-full items-center gap-3 rounded-full border px-5 py-3 text-left text-sm transition-colors"
              :class="activeStep === i ? 'border-lime bg-lime text-ink' : 'border-white/20 hover:border-white/50'"
              @click="activeStep = i"
            >
              <span class="font-semibold" :class="activeStep === i ? '' : 'text-lime'">0{{ i + 1 }}</span>
              <span class="flex-1">{{ s.title }}</span>
              <i class="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
            </button>
          </li>
        </ol>

        <div id="langkah-panel" role="tabpanel" :aria-labelledby="`langkah-tab-${activeStep}`" class="gradient-teal relative flex min-h-60 flex-col overflow-hidden rounded-3xl p-6">
          <svg class="pointer-events-none absolute -right-10 -bottom-12 h-56 w-72 text-lime/40" viewBox="0 0 280 220" fill="none" aria-hidden="true">
            <ellipse cx="140" cy="110" rx="130" ry="60" transform="rotate(-18 140 110)" stroke="currentColor" stroke-width="2" />
            <ellipse cx="140" cy="110" rx="100" ry="44" transform="rotate(-18 140 110)" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 6" />
          </svg>
          <span class="flex size-12 items-center justify-center rounded-full bg-lime text-lg text-ink"><i class="fa-solid" :class="step.icon" aria-hidden="true" /></span>
          <p class="mt-auto pt-8 text-xs text-white/70">Langkah 0{{ activeStep + 1 }}</p>
          <p class="text-2xl font-semibold">{{ step.title }}</p>
          <p class="mt-2 max-w-sm text-sm text-white/80">{{ step.text }}</p>
        </div>

        <div class="grid gap-4">
          <RouterLink to="/login" class="group flex flex-col justify-between rounded-3xl bg-white/[0.06] p-5 hover:bg-white/10">
            <p class="text-sm text-white/60">Sudah punya akun?</p>
            <p class="mt-6 flex items-end justify-between font-semibold">Masuk dan lanjutkan <span class="flex size-9 items-center justify-center rounded-full border border-white/30 group-hover:bg-white group-hover:text-ink"><i class="fa-solid fa-arrow-up-right-from-square text-xs" aria-hidden="true" /></span></p>
          </RouterLink>
          <RouterLink to="/register" class="group flex flex-col justify-between rounded-3xl bg-lime p-5 text-ink hover:bg-lime-dark">
            <p class="text-sm">Belum punya akun? Buat sekali untuk semua event.</p>
            <p class="mt-6 flex items-end justify-between text-lg font-semibold">Daftar akun <span class="flex size-9 items-center justify-center rounded-full bg-white"><i class="fa-solid fa-arrow-right text-xs" aria-hidden="true" /></span></p>
          </RouterLink>
        </div>
      </div>
    </div>
  </section>

  <!-- Teks besar -->
  <section class="mx-auto max-w-6xl px-4 pt-16 pb-12" aria-hidden="true">
    <p class="flex items-center justify-center gap-x-[0.25em] text-[8vw] font-extrabold tracking-tight whitespace-nowrap sm:text-6xl lg:text-7xl">
      Daftar <i class="fa-solid fa-plus text-[0.45em] text-lime" /> Unggah <i class="fa-solid fa-plus text-[0.45em] text-lime" /> Pantau
    </p>
    <div class="mt-6 flex items-center gap-4 text-white/40"><span class="h-px flex-1 bg-white/20" /><i class="fa-solid fa-star-of-life text-xs" /><span class="h-px flex-1 bg-white/20" /></div>
  </section>

  <!-- Footer -->
  <footer class="no-print mx-2 mb-2 rounded-[2.5rem] bg-lime text-ink sm:mx-3 sm:mb-3">
    <div class="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
      <div>
        <p class="flex items-center gap-2 text-xl font-semibold">
          <span class="flex size-8 items-center justify-center rounded-full bg-ink text-lime"><i class="fa-solid fa-clipboard-list text-sm" aria-hidden="true" /></span>
          Sistem Pendaftaran
        </p>
        <p class="mt-3 max-w-xs text-sm text-ink/75">Satu akun untuk mendaftar PMB, pelatihan, seminar, dan kegiatan lain.</p>
      </div>
      <nav aria-label="Event">
        <p class="text-xs font-semibold tracking-wider uppercase">Event</p>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="e in openEvents.slice(0, 4)" :key="e.id"><RouterLink :to="`/events/${e.slug}`" class="line-clamp-1 hover:underline">{{ e.name }}</RouterLink></li>
          <li v-if="!openEvents.length" class="text-ink/60">Belum ada event dibuka</li>
        </ul>
      </nav>
      <nav aria-label="Akun">
        <p class="text-xs font-semibold tracking-wider uppercase">Akun</p>
        <ul class="mt-3 space-y-2 text-sm">
          <li><RouterLink to="/login" class="hover:underline">Masuk</RouterLink></li>
          <li><RouterLink to="/register" class="hover:underline">Daftar Akun</RouterLink></li>
          <li><RouterLink to="/forgot-password" class="hover:underline">Lupa Password</RouterLink></li>
        </ul>
      </nav>
      <nav aria-label="Bantuan">
        <p class="text-xs font-semibold tracking-wider uppercase">Bantuan</p>
        <ul class="mt-3 space-y-2 text-sm">
          <li><a href="#langkah" class="hover:underline">Cara Mendaftar</a></li>
          <li><RouterLink to="/me" class="hover:underline">Pendaftaran Saya</RouterLink></li>
        </ul>
      </nav>
    </div>
    <p class="border-t border-ink/15 px-4 py-4 text-center text-xs text-ink/70">Data pribadi Anda hanya dipakai untuk keperluan pendaftaran.</p>
  </footer>
</template>

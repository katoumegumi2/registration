<script setup lang="ts">
import { REGISTRATION_STATUSES, type RegistrationStatus } from "@pendaftaran/shared";
import { BarElement, CategoryScale, Chart, Filler, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { computed, onMounted, ref, watch } from "vue";
import { Bar, Line } from "vue-chartjs";
import AsyncState from "@/components/data/AsyncState.vue";
import StatCard from "@/components/data/StatCard.vue";
import StatusBadge from "@/components/data/StatusBadge.vue";
import SelectInput from "@/components/form/SelectInput.vue";
import Badge from "@/components/ui/Badge.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorMessage } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useUrlFilters } from "@/composables/useUrlFilters";
import { formatTanggal, formatTanggalWIB } from "@/utils/format";
import DeadlineCalendar from "./DeadlineCalendar.vue";

Chart.register(BarElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip);
Chart.defaults.font.family = "'Schibsted Grotesk Variable', sans-serif";

const PRIMARY = "#4E9A0C";
const PRIMARY_FILL = "rgba(78, 154, 12, 0.14)";
const GRID = "#e2e8f0";
const INK = "#475569";

const auth = useAuth();
const { filters, toQuery } = useUrlFilters({ event_id: "" });
const events = ref<{ id: string; name: string }[]>([]);
const stats = ref<any>(null);
const loading = ref(true);
const error = ref("");

async function load() {
  // Data lama tetap tampil saat filter berganti, supaya layout tidak melompat.
  loading.value = !stats.value;
  error.value = "";
  try {
    stats.value = await api.get(`/admin/dashboard/stats?${toQuery()}`);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(async () => {
  events.value = await api.get("/admin/event-options").catch(() => []);
  await load();
});
watch(() => filters.event_id, load);

const shownStatuses = REGISTRATION_STATUSES.filter((s) => s !== "DRAFT") as RegistrationStatus[];
const count = (s: RegistrationStatus) => stats.value.by_status[s] ?? 0;
const needsReview = computed(() => count("SUBMITTED") + count("UNDER_REVIEW"));
const maxStatus = computed(() => Math.max(1, ...shownStatuses.map(count)));
const maxProgram = computed(() => Math.max(1, ...stats.value.by_program.map((p: any) => p.n)));

const sum = (rows: { n: number }[]) => rows.reduce((a, r) => a + r.n, 0);
const lastWeek = computed(() => sum(stats.value.daily.slice(-7)));
const prevWeek = computed(() => sum(stats.value.daily.slice(-14, -7)));
const weekHint = computed(() => {
  const d = lastWeek.value - prevWeek.value;
  if (d === 0) return "Sama dengan 7 hari sebelumnya";
  return `${d > 0 ? `+${d}` : d} dibanding 7 hari sebelumnya`;
});

const todayText = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date());
const listLink = (extra: Record<string, string> = {}) => ({ path: "/admin/registrations", query: { ...(filters.event_id ? { event_id: filters.event_id } : {}), ...extra } });

const scales = {
  x: { grid: { display: false }, ticks: { color: INK, maxRotation: 0, autoSkipPadding: 16 } },
  y: { beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { color: INK, precision: 0 } },
};
const baseOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false } } };
const lineOptions = { ...baseOptions, scales, interaction: { mode: "index" as const, intersect: false } };
const barOptions = { ...baseOptions, scales };

const shortDay = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const dailyData = computed(() => ({
  labels: stats.value.daily.map((r: any) => shortDay(r.day)),
  datasets: [{ label: "Pendaftaran", data: stats.value.daily.map((r: any) => r.n), borderColor: PRIMARY, backgroundColor: PRIMARY_FILL, fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: PRIMARY, cubicInterpolationMode: "monotone" as const }],
}));
const monthlyData = computed(() => ({
  labels: stats.value.monthly.map((r: any) => `${r.month.slice(5)}/${r.month.slice(2, 4)}`),
  datasets: [{ label: "Pendaftaran", data: stats.value.monthly.map((r: any) => r.n), backgroundColor: PRIMARY, borderRadius: 4, maxBarThickness: 18 }],
}));

const pct = (q: any) => (q.quota ? Math.min(100, Math.round((q.used / q.quota) * 100)) : 0);
const waitingDays = (d: string) => {
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  return n <= 0 ? "Hari ini" : `${n} hari`;
};
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-2xl font-bold text-ink">Dashboard</h1>
    <div class="w-72 max-w-full"><SelectInput v-model="filters.event_id" placeholder="Semua event" :options="events.map((e) => ({ value: e.id, label: e.name }))" /></div>
  </div>
  <AsyncState :loading="loading" :error="error" @retry="load">
    <div v-if="stats" class="grid items-start gap-4 xl:grid-cols-3">
      <div class="min-w-0 space-y-4 xl:col-span-2">
        <!-- Banner -->
        <section class="relative overflow-hidden rounded-3xl bg-lime p-6 text-ink">
          <div class="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full border-2 border-forest/20" aria-hidden="true" />
          <div class="pointer-events-none absolute -top-10 -right-2 size-44 rounded-full border-2 border-forest/20" aria-hidden="true" />
          <p class="relative text-sm first-letter:uppercase">{{ todayText }}</p>
          <h2 class="relative mt-1 text-2xl font-bold tracking-tight">Halo, {{ auth.staff?.full_name }}</h2>
          <p class="relative mt-1 max-w-lg text-sm">
            <template v-if="needsReview">Ada <strong>{{ needsReview }} pendaftaran</strong> yang menunggu ditinjau.</template>
            <template v-else>Semua pendaftaran sudah ditinjau.</template>
          </p>
          <div class="relative mt-4 flex flex-wrap items-center gap-3 text-sm font-medium">
            <RouterLink :to="listLink({ status: 'SUBMITTED' })" class="rounded-full bg-ink px-5 py-2.5 text-white hover:bg-ink/85">Mulai verifikasi <i class="fa-solid fa-arrow-right ml-1" aria-hidden="true" /></RouterLink>
            <RouterLink v-if="stats.failed_emails" to="/admin/notifications?status=FAILED" class="rounded-full border border-ink/50 px-4 py-2.5 hover:bg-ink/5"><i class="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true" />{{ stats.failed_emails }} email gagal terkirim</RouterLink>
          </div>
        </section>

        <!-- Ringkasan -->
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Pendaftar" :value="stats.total" icon="fa-users" dark :hint="filters.event_id ? 'Event terpilih' : 'Semua event'" />
          <StatCard label="7 hari terakhir" :value="lastWeek" icon="fa-chart-line" :hint="weekHint" />
          <StatCard label="Perlu ditinjau" :value="needsReview" icon="fa-hourglass-half" :hint="`${count('SUBMITTED')} baru, ${count('UNDER_REVIEW')} sedang ditinjau`" />
          <StatCard label="Diterima" :value="count('ACCEPTED')" icon="fa-circle-check" :hint="`${count('REJECTED')} ditolak, ${count('WAITING_LIST')} waiting list`" />
        </div>

        <Card title="Pendaftaran per hari (30 hari terakhir)"><div class="h-64"><Line :data="dailyData" :options="lineOptions" /></div></Card>
        <Card title="Pendaftaran per bulan"><div class="h-48"><Bar :data="monthlyData" :options="barOptions" /></div></Card>

        <!-- Antrean -->
        <Card>
          <div class="mb-3 flex items-center justify-between gap-3">
            <h2 class="text-lg font-semibold text-ink">Antrean verifikasi</h2>
            <RouterLink :to="listLink()" class="text-sm text-primary hover:underline">Lihat semua</RouterLink>
          </div>
          <div class="overflow-x-auto">
            <table v-if="stats.queue.length" class="w-full text-left text-sm">
              <thead class="border-b border-slate-200 text-slate-500"><tr><th class="py-2 pr-3 font-medium">Pendaftar</th><th class="pr-3 font-medium">Event</th><th class="pr-3 font-medium">Status</th><th class="text-right font-medium">Menunggu</th></tr></thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="r in stats.queue" :key="r.id" class="hover:bg-slate-50">
                  <td class="py-2 pr-3">
                    <RouterLink :to="`/admin/registrations/${r.id}`" class="font-medium text-primary hover:underline">{{ r.full_name }}</RouterLink>
                    <span class="block text-xs text-slate-500">{{ r.registration_number }}</span>
                  </td>
                  <td class="pr-3">{{ r.event_name }}</td>
                  <td class="pr-3 whitespace-nowrap"><StatusBadge :status="r.status" /> <Badge v-if="r.has_replaced_document" tone="yellow"><i class="fa-solid fa-rotate" aria-hidden="true" /><span class="sr-only">Berkas diperbarui</span></Badge></td>
                  <td class="text-right whitespace-nowrap">{{ waitingDays(r.submitted_at) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="py-4 text-sm text-slate-500">Tidak ada pendaftaran yang menunggu.</p>
          </div>
        </Card>

        <!-- Event -->
        <Card title="Event yang sedang buka">
          <div class="overflow-x-auto">
            <table v-if="stats.quotas.length" class="w-full text-left text-sm">
              <thead class="border-b border-slate-200 text-slate-500"><tr><th class="py-2 pr-3 font-medium">Event</th><th class="pr-3 font-medium">Pendaftar</th><th class="w-2/5 font-medium">Kuota</th></tr></thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="q in stats.quotas" :key="q.event_id">
                  <td class="py-3 pr-3"><span class="font-medium text-ink">{{ q.name }}</span><span class="block text-xs text-slate-500">{{ q.quota_mode === "FCFS" ? "Siapa cepat dia dapat" : "Seleksi" }} · ditutup {{ formatTanggal(q.end_at) }}</span></td>
                  <td class="pr-3">{{ q.submitted }}</td>
                  <td>
                    <div class="mb-1 text-xs text-slate-600">{{ q.used }}{{ q.quota !== null ? ` / ${q.quota}` : " (tanpa batas)" }} {{ q.quota_mode === "FCFS" ? "terdaftar" : "diterima" }}</div>
                    <div v-if="q.quota !== null" class="h-2 overflow-hidden rounded bg-slate-100" role="meter" :aria-valuenow="q.used" aria-valuemin="0" :aria-valuemax="q.quota" :aria-label="`Kuota ${q.name}`">
                      <div class="h-full rounded bg-chart" :style="{ width: `${pct(q)}%` }" />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="py-4 text-sm text-slate-500">Tidak ada event yang sedang buka.</p>
          </div>
        </Card>
      </div>

      <div class="min-w-0 space-y-4">
        <DeadlineCalendar :events="stats.quotas" />

        <Card title="Jumlah per status">
          <ul class="space-y-3">
            <li v-for="s in shownStatuses" :key="s">
              <RouterLink :to="listLink({ status: s })" class="block rounded-lg hover:bg-slate-50">
                <div class="mb-1 flex items-center justify-between text-sm"><StatusBadge :status="s" /><span class="font-semibold text-ink">{{ count(s) }}</span></div>
                <div class="h-2 overflow-hidden rounded bg-slate-100"><div class="h-full rounded bg-chart" :style="{ width: `${(count(s) / maxStatus) * 100}%` }" /></div>
              </RouterLink>
            </li>
          </ul>
        </Card>

        <Card title="Program terbanyak">
          <ul v-if="stats.by_program.length" class="space-y-3 text-sm">
            <li v-for="p in stats.by_program" :key="p.program_id">
              <div class="mb-1 flex items-center justify-between gap-2"><span class="min-w-0 truncate text-ink">{{ p.program }}</span><span class="font-semibold text-ink">{{ p.n }}</span></div>
              <div class="h-2 overflow-hidden rounded bg-slate-100"><div class="h-full rounded bg-chart" :style="{ width: `${(p.n / maxProgram) * 100}%` }" /></div>
            </li>
          </ul>
          <p v-else class="text-sm text-slate-500">Belum ada pendaftar yang memilih program.</p>
        </Card>

        <Card title="Pendaftaran terbaru">
          <ul v-if="stats.recent.length" class="divide-y divide-slate-100 text-sm">
            <li v-for="r in stats.recent" :key="r.id" class="py-2 first:pt-0 last:pb-0">
              <RouterLink :to="`/admin/registrations/${r.id}`" class="font-medium text-primary hover:underline">{{ r.full_name }}</RouterLink>
              <span class="block text-xs text-slate-500">{{ r.event_name }} · {{ formatTanggalWIB(r.submitted_at) }}</span>
            </li>
          </ul>
          <p v-else class="text-sm text-slate-500">Belum ada pendaftaran.</p>
        </Card>
      </div>
    </div>
  </AsyncState>
</template>

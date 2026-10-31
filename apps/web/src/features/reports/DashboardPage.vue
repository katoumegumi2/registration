<script setup lang="ts">
import { REGISTRATION_STATUSES, STATUS_LABELS, type RegistrationStatus } from "@pendaftaran/shared";
import { BarElement, CategoryScale, Chart, Filler, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { computed, onMounted, ref, watch } from "vue";
import { Bar, Line } from "vue-chartjs";
import AsyncState from "@/components/data/AsyncState.vue";
import StatCard from "@/components/data/StatCard.vue";
import SelectInput from "@/components/form/SelectInput.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorMessage } from "@/composables/useApi";
import { useUrlFilters } from "@/composables/useUrlFilters";

Chart.register(BarElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip);

const PRIMARY = "#2563EB";
const GRID = "#e2e8f0";
const INK = "#475569";

const { filters, toQuery } = useUrlFilters({ event_id: "" });
const events = ref<{ id: string; name: string }[]>([]);
const stats = ref<any>(null);
const loading = ref(true);
const error = ref("");

async function load() {
  loading.value = true;
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
  datasets: [{ label: "Pendaftaran", data: stats.value.daily.map((r: any) => r.n), borderColor: PRIMARY, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: PRIMARY, tension: 0 }],
}));
const monthlyData = computed(() => ({
  labels: stats.value.monthly.map((r: any) => `${r.month.slice(5)}/${r.month.slice(2, 4)}`),
  datasets: [{ label: "Pendaftaran", data: stats.value.monthly.map((r: any) => r.n), backgroundColor: PRIMARY, borderRadius: 4, maxBarThickness: 22 }],
}));
const statusData = computed(() => ({
  labels: shownStatuses.map((s) => STATUS_LABELS[s]),
  datasets: [{ label: "Jumlah", data: shownStatuses.map((s) => stats.value.by_status[s] ?? 0), backgroundColor: PRIMARY, borderRadius: 4, maxBarThickness: 28 }],
}));

const pct = (q: any) => (q.quota ? Math.min(100, Math.round((q.used / q.quota) * 100)) : 0);
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-2xl font-bold text-navy">Dashboard</h1>
    <div class="w-72 max-w-full"><SelectInput v-model="filters.event_id" placeholder="Semua event" :options="events.map((e) => ({ value: e.id, label: e.name }))" /></div>
  </div>
  <AsyncState :loading="loading" :error="error" @retry="load">
    <template v-if="stats">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total pendaftar" :value="stats.total" icon="fa-users" />
        <StatCard v-for="s in shownStatuses" :key="s" :label="STATUS_LABELS[s]" :value="stats.by_status[s] ?? 0" />
      </div>
      <div class="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Pendaftaran per hari (30 hari terakhir)"><div class="h-64"><Line :data="dailyData" :options="lineOptions" /></div></Card>
        <Card title="Pendaftaran per bulan"><div class="h-64"><Bar :data="monthlyData" :options="barOptions" /></div></Card>
        <Card title="Jumlah per status"><div class="h-64"><Bar :data="statusData" :options="barOptions" /></div></Card>
        <Card title="Kuota event yang sedang buka">
          <ul class="space-y-4">
            <li v-for="q in stats.quotas" :key="q.event_id">
              <div class="mb-1 flex justify-between gap-2 text-sm">
                <span class="font-medium text-navy">{{ q.name }}</span>
                <span class="whitespace-nowrap text-slate-600">{{ q.used }}{{ q.quota !== null ? ` / ${q.quota}` : " (tanpa batas)" }} · {{ q.quota_mode === "FCFS" ? "terdaftar" : "diterima" }}</span>
              </div>
              <div v-if="q.quota !== null" class="h-2 overflow-hidden rounded bg-slate-100" role="meter" :aria-valuenow="q.used" aria-valuemin="0" :aria-valuemax="q.quota" :aria-label="q.name">
                <div class="h-full rounded bg-primary" :style="{ width: `${pct(q)}%` }" />
              </div>
            </li>
            <li v-if="!stats.quotas.length" class="text-sm text-slate-500">Tidak ada event yang sedang buka.</li>
          </ul>
        </Card>
      </div>
    </template>
  </AsyncState>
</template>

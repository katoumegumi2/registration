<script setup lang="ts">
import { STATUS_LABELS, type RegistrationStatus } from "@pendaftaran/shared";
import { onMounted, ref, watch } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import StatusBadge from "@/components/data/StatusBadge.vue";
import SelectInput from "@/components/form/SelectInput.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorMessage } from "@/composables/useApi";
import { useUrlFilters } from "@/composables/useUrlFilters";
import { formatTanggal, formatTanggalWIB } from "@/utils/format";

const { filters } = useUrlFilters({ event_id: "" });
const events = ref<{ id: string; name: string }[]>([]);
const data = ref<any>(null);
const loading = ref(false);
const error = ref("");

async function load() {
  data.value = null;
  error.value = "";
  if (!filters.event_id) return;
  loading.value = true;
  try {
    data.value = await api.get(`/admin/reports/summary?event_id=${filters.event_id}`);
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
const print = () => window.print();
const label = (s: string) => STATUS_LABELS[s as RegistrationStatus];
</script>

<template>
  <div class="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-2xl font-bold text-ink">Laporan</h1>
    <div class="flex flex-wrap gap-2">
      <div class="w-72 max-w-full"><SelectInput v-model="filters.event_id" placeholder="Pilih event" :options="events.map((e) => ({ value: e.id, label: e.name }))" /></div>
      <Button :disabled="!data" @click="print"><i class="fa-solid fa-print" aria-hidden="true" /> Cetak / simpan PDF</Button>
    </div>
  </div>
  <p v-if="!filters.event_id" class="py-12 text-center text-slate-500">Pilih event untuk melihat laporan.</p>
  <AsyncState :loading="loading" :error="error" @retry="load">
    <article v-if="data" class="space-y-4">
      <header>
        <h2 class="text-xl font-bold text-ink">Laporan Pendaftaran: {{ data.event.name }}</h2>
        <p class="text-sm text-slate-600">Periode {{ formatTanggal(data.event.start_at) }} – {{ formatTanggal(data.event.end_at) }} · Total {{ data.total }} pendaftar · Dicetak {{ formatTanggalWIB(new Date()) }}</p>
      </header>
      <div class="grid gap-4 md:grid-cols-3 print:grid-cols-3">
        <Card title="Per status"><table class="w-full text-sm"><tbody><tr v-for="(n, s) in data.by_status" :key="s"><td class="py-0.5">{{ label(String(s)) }}</td><td class="text-right font-medium">{{ n }}</td></tr></tbody></table></Card>
        <Card title="Per program"><table class="w-full text-sm"><tbody><tr v-for="p in data.by_program" :key="p.program ?? 'none'"><td class="py-0.5">{{ p.program ?? "Tanpa program" }}</td><td class="text-right font-medium">{{ p.n }}</td></tr></tbody></table></Card>
        <Card title="Per hari"><table class="w-full text-sm"><tbody><tr v-for="d in data.by_day" :key="d.day"><td class="py-0.5">{{ formatTanggal(d.day) }}</td><td class="text-right font-medium">{{ d.n }}</td></tr></tbody></table></Card>
      </div>
      <Card title="Daftar pendaftar">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500"><tr><th class="py-2 pr-2 font-medium">Nomor</th><th class="pr-2 font-medium">Nama</th><th class="pr-2 font-medium">NIK</th><th class="pr-2 font-medium">Program</th><th class="pr-2 font-medium">Status</th><th class="font-medium">Submit</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="r in data.registrants" :key="r.id" class="break-inside-avoid">
              <td class="py-1.5 pr-2 whitespace-nowrap">{{ r.registration_number }}</td><td class="pr-2">{{ r.full_name }}</td><td class="pr-2 whitespace-nowrap">{{ r.nik_masked }}</td><td class="pr-2">{{ r.program_name ?? "—" }}</td><td class="pr-2"><StatusBadge :status="r.status" /></td><td class="whitespace-nowrap">{{ formatTanggal(r.submitted_at) }}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </article>
  </AsyncState>
</template>

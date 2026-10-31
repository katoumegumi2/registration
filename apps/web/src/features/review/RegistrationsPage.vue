<script setup lang="ts">
import { REGISTRATION_STATUSES, STATUS_LABELS } from "@pendaftaran/shared";
import { computed, onMounted, ref, watch } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import Pagination from "@/components/data/Pagination.vue";
import StatusBadge from "@/components/data/StatusBadge.vue";
import SelectInput from "@/components/form/SelectInput.vue";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorMessage } from "@/composables/useApi";
import { useUrlFilters } from "@/composables/useUrlFilters";
import { formatTanggalWIB } from "@/utils/format";

const { filters, toQuery } = useUrlFilters({ q: "", event_id: "", status: "", program_id: "", from: "", to: "", page: "1" });
const options = ref<any[]>([]);
const data = ref<any>(null);
const loading = ref(true);
const error = ref("");

const programs = computed(() => options.value.find((e) => e.id === filters.event_id)?.programs ?? []);
const statusOptions = REGISTRATION_STATUSES.filter((s) => s !== "DRAFT").map((s) => ({ value: s, label: STATUS_LABELS[s] }));

async function load() {
  loading.value = true;
  error.value = "";
  try {
    data.value = await api.get(`/admin/registrations?${toQuery()}`);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

let debounce: ReturnType<typeof setTimeout>;
onMounted(async () => {
  options.value = await api.get("/admin/event-options").catch(() => []);
  await load();
});
watch(() => [filters.event_id, filters.status, filters.program_id, filters.from, filters.to], () => {
  if (filters.page !== "1") filters.page = "1";
  else load();
});
watch(() => filters.event_id, () => (filters.program_id = ""));
watch(() => filters.page, load);
watch(() => filters.q, () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (filters.page !== "1") filters.page = "1";
    else load();
  }, 300);
});

const exportUrl = (format: string) => {
  const { page: _page, ...rest } = filters;
  const q = new URLSearchParams(Object.entries({ ...rest, format }).filter(([, v]) => v !== "") as [string, string][]);
  return `/api/v1/admin/registrations/export?${q}`;
};
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-2xl font-bold text-ink">Pendaftar</h1>
    <div class="flex gap-2">
      <a :href="exportUrl('csv')"><Button variant="secondary" size="sm"><i class="fa-solid fa-file-csv" aria-hidden="true" /> CSV</Button></a>
      <a :href="exportUrl('xlsx')"><Button variant="secondary" size="sm"><i class="fa-solid fa-file-excel" aria-hidden="true" /> Excel</Button></a>
    </div>
  </div>
  <Card class="mb-4">
    <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <input v-model="filters.q" type="search" placeholder="Cari nama, nomor, NIK, email" aria-label="Cari" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm md:col-span-3 xl:col-span-2" />
      <SelectInput v-model="filters.event_id" placeholder="Semua event" :options="options.map((e) => ({ value: e.id, label: e.name }))" />
      <SelectInput v-model="filters.status" placeholder="Semua status" :options="statusOptions" />
      <SelectInput v-model="filters.program_id" placeholder="Semua program" :disabled="!programs.length" :options="programs.map((p: any) => ({ value: p.id, label: p.name }))" />
      <div class="flex gap-2 md:col-span-3 xl:col-span-1">
        <input v-model="filters.from" type="date" aria-label="Dari tanggal" class="w-full min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
        <input v-model="filters.to" type="date" aria-label="Sampai tanggal" class="w-full min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
      </div>
    </div>
  </Card>
  <Card>
    <AsyncState :loading="loading" :error="error" :empty="data && !data.rows.length" empty-text="Tidak ada pendaftar yang cocok." @retry="load">
      <div v-if="data" class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500">
            <tr><th class="py-2 pr-3 font-medium">Nomor</th><th class="pr-3 font-medium">Nama</th><th class="pr-3 font-medium">NIK</th><th class="pr-3 font-medium">Event</th><th class="pr-3 font-medium">Program</th><th class="pr-3 font-medium">Status</th><th class="font-medium">Submit</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="r in data.rows" :key="r.id" class="hover:bg-slate-50">
              <td class="py-2 pr-3 whitespace-nowrap"><RouterLink :to="`/admin/registrations/${r.id}`" class="font-medium text-primary hover:underline">{{ r.registration_number }}</RouterLink></td>
              <td class="pr-3">{{ r.full_name }} <Badge v-if="r.has_replaced_document" tone="yellow"><i class="fa-solid fa-rotate" aria-hidden="true" /> Berkas diperbarui</Badge></td>
              <td class="pr-3 whitespace-nowrap">{{ r.nik_masked }}</td>
              <td class="pr-3">{{ r.event_name }}</td>
              <td class="pr-3">{{ r.program_name ?? "—" }}</td>
              <td class="pr-3"><StatusBadge :status="r.status" /></td>
              <td class="whitespace-nowrap">{{ formatTanggalWIB(r.submitted_at) }}</td>
            </tr>
          </tbody>
        </table>
        <Pagination :page="data.page" :page-size="data.page_size" :total="data.total" @change="(p: number) => (filters.page = String(p))" />
      </div>
    </AsyncState>
  </Card>
</template>

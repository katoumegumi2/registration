<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import Pagination from "@/components/data/Pagination.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorMessage } from "@/composables/useApi";
import { useUrlFilters } from "@/composables/useUrlFilters";
import { formatTanggalWIB } from "@/utils/format";

const { filters, toQuery } = useUrlFilters({ actor_id: "", action: "", entity_type: "", from: "", to: "", page: "1" });
const data = ref<any>(null);
const loading = ref(true);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    data.value = await api.get(`/admin/activity-logs?${toQuery()}`);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => filters.page, load);
watch(() => [filters.action, filters.entity_type, filters.actor_id, filters.from, filters.to], () => {
  if (filters.page !== "1") filters.page = "1";
  else load();
});
const cls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
</script>

<template>
  <h1 class="mb-4 text-2xl font-bold text-ink">Activity Log</h1>
  <Card class="mb-4">
    <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      <input v-model.lazy="filters.action" placeholder="Aksi, mis. STATUS_CHANGED" aria-label="Aksi" :class="cls" />
      <input v-model.lazy="filters.entity_type" placeholder="Entitas, mis. registration" aria-label="Entitas" :class="cls" />
      <input v-model.lazy="filters.actor_id" placeholder="ID aktor" aria-label="ID aktor" :class="cls" />
      <input v-model="filters.from" type="date" aria-label="Dari tanggal" :class="cls" />
      <input v-model="filters.to" type="date" aria-label="Sampai tanggal" :class="cls" />
    </div>
  </Card>
  <Card>
    <AsyncState :loading="loading" :error="error" :empty="data && !data.rows.length" empty-text="Tidak ada log yang cocok." @retry="load">
      <div v-if="data" class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500"><tr><th class="py-2 pr-3 font-medium">Waktu</th><th class="pr-3 font-medium">Aksi</th><th class="pr-3 font-medium">Keterangan</th><th class="pr-3 font-medium">Aktor</th><th class="font-medium">IP</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="l in data.rows" :key="l.id"><td class="py-2 pr-3 whitespace-nowrap">{{ formatTanggalWIB(l.createdAt) }}</td><td class="pr-3 font-mono text-xs">{{ l.action }}</td><td class="pr-3">{{ l.description }}</td><td class="pr-3">{{ l.actorType }}</td><td class="whitespace-nowrap">{{ l.ipAddress ?? "—" }}</td></tr>
          </tbody>
        </table>
        <Pagination :page="data.page" :page-size="data.page_size" :total="data.total" @change="(n: number) => (filters.page = String(n))" />
      </div>
    </AsyncState>
  </Card>
</template>

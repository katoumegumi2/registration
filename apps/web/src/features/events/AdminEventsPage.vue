<script setup lang="ts">
import { onMounted, ref } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorMessage } from "@/composables/useApi";
import { EVENT_TYPE_LABELS, formatTanggal } from "@/utils/format";

const rows = ref<any[]>([]);
const loading = ref(true);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    rows.value = await api.get("/admin/events");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
const tone = (s: string) => (s === "PUBLISHED" ? "green" : s === "CLOSED" ? "red" : "gray");
const statusLabel: Record<string, string> = { DRAFT: "Draft", PUBLISHED: "Dipublikasikan", CLOSED: "Ditutup" };
</script>

<template>
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-2xl font-bold text-ink">Event</h1>
    <RouterLink to="/admin/events/new"><Button><i class="fa-solid fa-plus" aria-hidden="true" /> Buat event</Button></RouterLink>
  </div>
  <Card>
    <AsyncState :loading="loading" :error="error" :empty="!rows.length" empty-text="Belum ada event." @retry="load">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500"><tr><th class="py-2 pr-3 font-medium">Nama</th><th class="pr-3 font-medium">Jenis</th><th class="pr-3 font-medium">Prefix</th><th class="pr-3 font-medium">Periode</th><th class="pr-3 font-medium">Kuota</th><th class="font-medium">Status</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="e in rows" :key="e.id" class="hover:bg-slate-50">
              <td class="py-2 pr-3"><RouterLink :to="`/admin/events/${e.id}`" class="font-medium text-primary hover:underline">{{ e.name }}</RouterLink></td>
              <td class="pr-3">{{ EVENT_TYPE_LABELS[e.type] }}</td><td class="pr-3">{{ e.registration_prefix }}</td>
              <td class="pr-3 whitespace-nowrap">{{ formatTanggal(e.start_at) }} – {{ formatTanggal(e.end_at) }}</td>
              <td class="pr-3 whitespace-nowrap">{{ e.quota ?? "Tanpa batas" }} · {{ e.quota_mode === "FCFS" ? "Siapa cepat" : "Seleksi" }}</td>
              <td><Badge :tone="tone(e.status)">{{ statusLabel[e.status] }}</Badge></td>
            </tr>
          </tbody>
        </table>
      </div>
    </AsyncState>
  </Card>
</template>

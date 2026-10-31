<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import Pagination from "@/components/data/Pagination.vue";
import SelectInput from "@/components/form/SelectInput.vue";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorMessage } from "@/composables/useApi";
import { useToast } from "@/composables/useFeedback";
import { useUrlFilters } from "@/composables/useUrlFilters";
import { formatTanggalWIB } from "@/utils/format";

const { filters, toQuery } = useUrlFilters({ status: "", page: "1" });
const toast = useToast();
const data = ref<any>(null);
const loading = ref(true);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    data.value = await api.get(`/admin/notifications?${toQuery()}`);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => filters.page, load);
watch(() => filters.status, () => {
  if (filters.page !== "1") filters.page = "1";
  else load();
});

async function retry(n: any) {
  try {
    await api.post(`/admin/notifications/${n.id}/retry`);
    toast.success("Email dimasukkan ke antrean lagi");
    await load();
  } catch (e) {
    toast.error(errorMessage(e));
  }
}
const tone = (s: string) => (s === "SENT" ? "green" : s === "FAILED" ? "red" : "yellow");
const labels: Record<string, string> = { SENT: "Terkirim", FAILED: "Gagal", PENDING: "Menunggu" };
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-2xl font-bold text-ink">Outbox Email</h1>
    <div class="w-48"><SelectInput v-model="filters.status" placeholder="Semua status" :options="Object.entries(labels).map(([value, label]) => ({ value, label }))" /></div>
  </div>
  <Card>
    <AsyncState :loading="loading" :error="error" :empty="data && !data.rows.length" empty-text="Belum ada email." @retry="load">
      <div v-if="data" class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500"><tr><th class="py-2 pr-3 font-medium">Dibuat</th><th class="pr-3 font-medium">Tujuan</th><th class="pr-3 font-medium">Subjek</th><th class="pr-3 font-medium">Status</th><th class="font-medium">Aksi</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="n in data.rows" :key="n.id">
              <td class="py-2 pr-3 whitespace-nowrap">{{ formatTanggalWIB(n.created_at) }}</td><td class="pr-3">{{ n.recipient }}</td><td class="pr-3">{{ n.subject }}</td>
              <td class="pr-3"><Badge :tone="tone(n.status)">{{ labels[n.status] }}</Badge><span v-if="n.last_error" class="mt-1 block max-w-64 text-xs break-words text-red-700">{{ n.last_error }}</span></td>
              <td><Button v-if="n.status === 'FAILED'" variant="secondary" size="sm" @click="retry(n)">Kirim ulang</Button></td>
            </tr>
          </tbody>
        </table>
        <Pagination :page="data.page" :page-size="data.page_size" :total="data.total" @change="(p: number) => (filters.page = String(p))" />
      </div>
    </AsyncState>
  </Card>
</template>

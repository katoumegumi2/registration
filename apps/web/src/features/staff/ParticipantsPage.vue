<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import Pagination from "@/components/data/Pagination.vue";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorMessage } from "@/composables/useApi";
import { useConfirm, useToast } from "@/composables/useFeedback";
import { useUrlFilters } from "@/composables/useUrlFilters";
import { formatTanggalWIB } from "@/utils/format";

const { filters, toQuery } = useUrlFilters({ q: "", page: "1" });
const data = ref<any>(null);
const loading = ref(true);
const error = ref("");
const toast = useToast();
const confirm = useConfirm();

async function load() {
  loading.value = true;
  error.value = "";
  try {
    data.value = await api.get(`/admin/participants?${toQuery()}`);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => filters.page, load);
let debounce: ReturnType<typeof setTimeout>;
watch(() => filters.q, () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (filters.page !== "1") filters.page = "1";
    else load();
  }, 300);
});

async function verify(p: any) {
  if (!(await confirm({ title: "Verifikasi akun manual", message: `Tandai email ${p.email} sudah terverifikasi? Aksi ini tercatat di log.`, confirmLabel: "Verifikasi" }))) return;
  try {
    await api.post(`/admin/participants/${p.id}/verify`);
    toast.success("Akun diverifikasi");
    await load();
  } catch (e) {
    toast.error(errorMessage(e));
  }
}
</script>

<template>
  <h1 class="mb-4 text-2xl font-bold text-ink">Akun Pendaftar</h1>
  <Card class="mb-4"><input v-model="filters.q" type="search" placeholder="Cari nama, email, NIK" aria-label="Cari" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></Card>
  <Card>
    <AsyncState :loading="loading" :error="error" :empty="data && !data.rows.length" empty-text="Tidak ada akun yang cocok." @retry="load">
      <div v-if="data" class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500"><tr><th class="py-2 pr-3 font-medium">Nama</th><th class="pr-3 font-medium">NIK</th><th class="pr-3 font-medium">Email</th><th class="pr-3 font-medium">Email terverifikasi</th><th class="font-medium">Aksi</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="p in data.rows" :key="p.id">
              <td class="py-2 pr-3">{{ p.full_name }}</td><td class="pr-3 whitespace-nowrap">{{ p.nik_masked }}</td><td class="pr-3">{{ p.email }}</td>
              <td class="pr-3"><Badge v-if="p.email_verified_at" tone="green">{{ formatTanggalWIB(p.email_verified_at) }}</Badge><Badge v-else tone="yellow">Belum</Badge></td>
              <td><Button v-if="!p.email_verified_at" size="sm" variant="secondary" @click="verify(p)">Verifikasi manual</Button></td>
            </tr>
          </tbody>
        </table>
        <Pagination :page="data.page" :page-size="data.page_size" :total="data.total" @change="(n: number) => (filters.page = String(n))" />
      </div>
    </AsyncState>
  </Card>
</template>

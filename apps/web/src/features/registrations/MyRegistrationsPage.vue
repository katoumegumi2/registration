<script setup lang="ts">
import { onMounted, ref } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import StatusBadge from "@/components/data/StatusBadge.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorMessage } from "@/composables/useApi";
import { formatTanggalWIB } from "@/utils/format";
import { STATUS_LABELS, canReplaceDocument } from "@pendaftaran/shared";

const rows = ref<any[]>([]);
const loading = ref(true);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    rows.value = await api.get("/me/registrations");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const toFix = (r: any) => r.documents.filter((d: any) => d.verification_status === "INVALID" && canReplaceDocument(r.status, "INVALID"));
</script>

<template>
  <h1 class="mb-4 text-2xl font-bold text-ink">Pendaftaran Saya</h1>
  <AsyncState :loading="loading" :error="error" :empty="!rows.length" empty-text="Anda belum mendaftar ke event mana pun." @retry="load">
    <div class="space-y-4">
      <Card v-for="r in rows" :key="r.id">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="font-semibold text-ink">{{ r.event.name }}</h2>
            <p class="text-sm text-slate-600">{{ r.registration_number ?? "Belum dikirim" }}<span v-if="r.program_name"> · {{ r.program_name }}</span></p>
          </div>
          <StatusBadge :status="r.status" />
        </div>
        <p v-if="r.verification_notes" class="mt-3 rounded-lg bg-primary-light p-3 text-sm"><strong>Catatan panitia:</strong> {{ r.verification_notes }}</p>
        <div v-if="toFix(r).length" class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm" role="status">
          <p class="font-medium text-red-800"><i class="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true" />Berkas perlu diganti:</p>
          <ul class="mt-1 list-disc pl-5 text-red-800">
            <li v-for="d in toFix(r)" :key="d.id">{{ d.document_type_name }}<span v-if="d.notes">: {{ d.notes }}</span></li>
          </ul>
        </div>
        <details v-if="r.history.length" class="mt-3 text-sm">
          <summary class="cursor-pointer text-primary">Riwayat status</summary>
          <ol class="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
            <li v-for="h in r.history" :key="h.id">
              <strong>{{ STATUS_LABELS[h.to_status as keyof typeof STATUS_LABELS] }}</strong> <span class="text-slate-500">· {{ formatTanggalWIB(h.changed_at) }}</span>
              <span v-if="h.notes" class="block text-slate-600">{{ h.notes }}</span>
            </li>
          </ol>
        </details>
        <div class="mt-3 flex flex-wrap gap-3 text-sm">
          <RouterLink :to="`/me/registrations/${r.id}`" class="font-medium text-primary hover:underline">{{ r.status === "DRAFT" ? "Lanjutkan pendaftaran" : "Lihat pendaftaran" }}</RouterLink>
          <RouterLink v-if="r.registration_number" :to="`/me/registrations/${r.id}/receipt`" class="font-medium text-primary hover:underline">Bukti pendaftaran</RouterLink>
        </div>
      </Card>
    </div>
  </AsyncState>
</template>

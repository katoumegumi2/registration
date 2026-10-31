<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AsyncState from "@/components/data/AsyncState.vue";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, ApiError, errorMessage } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useToast } from "@/composables/useFeedback";
import { EVENT_TYPE_LABELS, formatTanggalWIB } from "@/utils/format";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const toast = useToast();
const event = ref<any>(null);
const loading = ref(true);
const error = ref("");
const busy = ref(false);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    event.value = await api.get(`/events/${route.params.slug}`);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function daftar() {
  if (!(await auth.loadParticipant())) return router.push({ path: "/login", query: { next: route.fullPath } });
  busy.value = true;
  try {
    const r = await api.post(`/events/${event.value.id}/registrations`);
    if (r.existing) toast.success("Anda sudah punya pendaftaran di event ini");
    router.push(`/me/registrations/${r.id}`);
  } catch (e) {
    toast.error(errorMessage(e));
    if (e instanceof ApiError && e.code === "QUOTA_FULL") await load();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AsyncState :loading="loading" :error="error" @retry="load">
    <template v-if="event">
      <div class="mb-4 flex flex-wrap gap-2">
        <Badge tone="blue">{{ EVENT_TYPE_LABELS[event.type] }}</Badge>
        <Badge :tone="event.is_open ? 'green' : 'gray'">{{ event.is_open ? "Buka" : event.is_full ? "Kuota penuh" : "Tutup" }}</Badge>
      </div>
      <h1 class="text-2xl font-bold text-navy">{{ event.name }}</h1>
      <p class="mt-2 whitespace-pre-line text-slate-700">{{ event.description }}</p>
      <div class="mt-5 grid gap-4 md:grid-cols-2">
        <Card title="Jadwal dan kuota">
          <dl class="space-y-2 text-sm">
            <div><dt class="text-slate-500">Dibuka</dt><dd>{{ formatTanggalWIB(event.start_at) }}</dd></div>
            <div><dt class="text-slate-500">Ditutup</dt><dd>{{ formatTanggalWIB(event.end_at) }}</dd></div>
            <div>
              <dt class="text-slate-500">Kuota</dt>
              <dd>
                <template v-if="event.quota_mode === 'SELECTION'">Seleksi{{ event.quota !== null ? `, ${event.quota} orang diterima` : "" }}</template>
                <template v-else-if="event.remaining === null">Tanpa batas</template>
                <template v-else>Sisa {{ event.remaining }} dari {{ event.quota }} (siapa cepat dia dapat)</template>
              </dd>
            </div>
          </dl>
        </Card>
        <Card title="Syarat dokumen">
          <ul class="space-y-2 text-sm">
            <li v-for="r in event.requirements" :key="r.document_type_id" class="flex items-start justify-between gap-2">
              <span>{{ r.name }}<span v-if="r.notes" class="block text-xs text-slate-500">{{ r.notes }}</span></span>
              <Badge :tone="r.is_required ? 'red' : 'gray'">{{ r.is_required ? "Wajib" : "Opsional" }}</Badge>
            </li>
            <li v-if="!event.requirements.length" class="text-slate-500">Tidak ada syarat dokumen.</li>
          </ul>
          <p class="mt-3 text-xs text-slate-500">Format PDF, DOC, DOCX, JPG, atau PNG. Maksimal 5 MB per file.</p>
        </Card>
        <Card v-if="event.programs.length" title="Pilihan program" class="md:col-span-2">
          <ul class="flex flex-wrap gap-2 text-sm"><li v-for="p in event.programs" :key="p.id" class="rounded-lg bg-primary-light px-3 py-1">{{ p.name }}</li></ul>
        </Card>
      </div>
      <div class="mt-6">
        <Button :disabled="!event.is_open" :loading="busy" @click="daftar">
          <i class="fa-solid fa-pen-to-square" aria-hidden="true" /> {{ event.is_open ? "Daftar sekarang" : event.is_full ? "Kuota penuh" : "Pendaftaran tutup" }}
        </Button>
      </div>
    </template>
  </AsyncState>
</template>

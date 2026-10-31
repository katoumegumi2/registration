<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import AsyncState from "@/components/data/AsyncState.vue";
import StatusBadge from "@/components/data/StatusBadge.vue";
import Button from "@/components/ui/Button.vue";
import { api, errorMessage } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { formatTanggalWIB } from "@/utils/format";

const route = useRoute();
const auth = useAuth();
const reg = ref<any>(null);
const loading = ref(true);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    await auth.loadParticipant();
    reg.value = await api.get(`/me/registrations/${route.params.id}`);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
const print = () => window.print();
</script>

<template>
  <AsyncState :loading="loading" :error="error" @retry="load">
    <template v-if="reg">
      <div class="no-print mb-4 flex flex-wrap gap-2">
        <Button @click="print"><i class="fa-solid fa-print" aria-hidden="true" /> Cetak / simpan PDF</Button>
        <RouterLink to="/me" class="self-center text-sm text-primary hover:underline">Kembali ke Pendaftaran Saya</RouterLink>
      </div>
      <article class="mx-auto max-w-2xl rounded-3xl border border-black/5 bg-white p-6 print:border-0 print:p-0">
        <header class="border-b border-slate-200 pb-3">
          <h1 class="text-xl font-bold text-ink">Bukti Pendaftaran</h1>
          <p class="text-sm text-slate-600">{{ reg.event.name }}</p>
        </header>
        <p v-if="!reg.registration_number" class="mt-4 text-sm text-red-700">Pendaftaran ini belum dikirim, jadi belum punya nomor registrasi.</p>
        <dl class="mt-4 grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
          <dt class="text-slate-500">Nomor registrasi</dt><dd class="font-semibold text-ink">{{ reg.registration_number ?? "—" }}</dd>
          <dt class="text-slate-500">Status</dt><dd><StatusBadge :status="reg.status" /></dd>
          <template v-if="reg.program_name"><dt class="text-slate-500">Program</dt><dd>{{ reg.program_name }}</dd></template>
          <dt class="text-slate-500">Waktu submit</dt><dd>{{ formatTanggalWIB(reg.submitted_at) }}</dd>
          <dt class="text-slate-500">Nama</dt><dd>{{ auth.participant?.full_name }}</dd>
          <dt class="text-slate-500">NIK</dt><dd>{{ auth.participant?.nik }}</dd>
          <dt class="text-slate-500">Email</dt><dd class="break-all">{{ auth.participant?.email }}</dd>
          <dt class="text-slate-500">No. HP</dt><dd>{{ auth.participant?.phone }}</dd>
        </dl>
        <h2 class="mt-5 mb-2 text-sm font-semibold text-ink">Dokumen</h2>
        <ul class="list-disc pl-5 text-sm">
          <li v-for="d in reg.documents" :key="d.id" class="break-all">{{ d.document_type_name }}: {{ d.original_name }}</li>
          <li v-if="!reg.documents.length" class="list-none text-slate-500">Tidak ada dokumen.</li>
        </ul>
        <p class="mt-6 text-xs text-slate-500">Simpan bukti ini. Status terbaru bisa dilihat di menu Pendaftaran Saya setelah masuk ke akun Anda.</p>
      </article>
    </template>
  </AsyncState>
</template>

<script setup lang="ts">
import { canReplaceDocument } from "@pendaftaran/shared";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AsyncState from "@/components/data/AsyncState.vue";
import DocStatusBadge from "@/components/data/DocStatusBadge.vue";
import StatusBadge from "@/components/data/StatusBadge.vue";
import FileUpload from "@/components/form/FileUpload.vue";
import SelectInput from "@/components/form/SelectInput.vue";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorMessage } from "@/composables/useApi";
import { useConfirm, useToast } from "@/composables/useFeedback";
import { formatBytes } from "@/utils/format";
import RegistrationProgress from "./RegistrationProgress.vue";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const id = computed(() => String(route.params.id));
const reg = ref<any>(null);
const loading = ref(true);
const error = ref("");
const busy = ref(false);
const submitError = ref("");
const step = ref(0);
const programId = ref("");

const isDraft = computed(() => reg.value?.status === "DRAFT");
const needsProgram = computed(() => reg.value?.event.requires_program || reg.value?.programs.length > 0);
const steps = computed(() => [...(needsProgram.value ? ["Pilih program"] : []), "Unggah dokumen", "Tinjau dan kirim"]);
const stepName = computed(() => steps.value[step.value]);
const docFor = (typeId: string) => reg.value?.documents.find((d: any) => d.document_type_id === typeId);
const missing = computed(() => (reg.value?.requirements ?? []).filter((r: any) => r.is_required && !docFor(r.document_type_id)));
const programMissing = computed(() => reg.value?.event.requires_program && !reg.value?.program_id);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    reg.value = await api.get(`/me/registrations/${id.value}`);
    programId.value = reg.value.program_id ?? "";
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

async function reload() {
  reg.value = await api.get(`/me/registrations/${id.value}`);
}

onMounted(load);
watch(steps, () => (step.value = Math.min(step.value, steps.value.length - 1)));

async function saveProgram() {
  busy.value = true;
  try {
    reg.value = await api.patch(`/me/registrations/${id.value}`, { program_id: programId.value || null });
    step.value++;
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busy.value = false;
  }
}

async function removeDoc(d: any) {
  if (!(await confirm({ title: "Hapus file", message: `Hapus ${d.original_name}?`, confirmLabel: "Hapus", danger: true }))) return;
  try {
    await api.del(`/me/registrations/${id.value}/documents/${d.id}`);
    await reload();
    toast.success("File dihapus");
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

async function openDoc(d: any) {
  try {
    const { url } = await api.get(`/me/registrations/${id.value}/documents/${d.id}/url`);
    window.open(url, "_blank", "noopener");
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

async function submit() {
  submitError.value = "";
  if (!(await confirm({ title: "Kirim pendaftaran", message: `Kirim pendaftaran ke ${reg.value.event.name}?`, confirmLabel: "Kirim" }))) return;
  busy.value = true;
  try {
    await api.post(`/me/registrations/${id.value}/submit`);
    toast.success("Pendaftaran terkirim");
    router.push(`/me/registrations/${id.value}/receipt`);
  } catch (e) {
    // Kuota penuh: pesan jelas, draft tetap ada (PE-05).
    submitError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AsyncState :loading="loading" :error="error" @retry="load">
    <template v-if="reg">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 class="text-2xl font-bold text-ink">{{ reg.event.name }}</h1>
          <p class="text-sm text-slate-600">{{ reg.registration_number ?? "Draft pendaftaran" }}<span v-if="reg.program_name"> · {{ reg.program_name }}</span></p>
        </div>
        <StatusBadge :status="reg.status" />
      </div>

      <Card v-if="!isDraft" class="mb-4"><RegistrationProgress :registration="reg" /></Card>

      <!-- Wizard saat draft -->
      <template v-if="isDraft">
        <ol class="mb-4 flex flex-wrap gap-2 text-sm">
          <li v-for="(s, i) in steps" :key="s" class="rounded-full px-3 py-1" :class="i === step ? 'bg-forest text-white' : i < step ? 'bg-primary-light text-primary' : 'bg-white text-slate-600'">{{ i + 1 }}. {{ s }}</li>
        </ol>

        <Card v-if="stepName === 'Pilih program'" title="Pilih program">
          <SelectInput v-model="programId" label="Program" :required="reg.event.requires_program" placeholder="Pilih program" :options="reg.programs.map((p: any) => ({ value: p.id, label: p.name }))" />
          <Button class="mt-4" :loading="busy" :disabled="reg.event.requires_program && !programId" @click="saveProgram">Lanjut</Button>
        </Card>
      </template>

      <Card v-if="!isDraft || stepName === 'Unggah dokumen'" title="Dokumen">
        <p v-if="isDraft" class="mb-3 text-sm text-slate-600">Format PDF, DOC, DOCX, JPG, atau PNG. Maksimal 5 MB per file.</p>
        <ul class="divide-y divide-slate-100">
          <li v-for="r in reg.requirements" :key="r.document_type_id" class="py-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="min-w-0">
                <span class="font-medium text-ink">{{ r.name }}</span>
                <Badge class="ml-2" :tone="r.is_required ? 'red' : 'gray'">{{ r.is_required ? "Wajib" : "Opsional" }}</Badge>
                <p v-if="r.notes" class="text-xs text-slate-500">{{ r.notes }}</p>
              </div>
              <DocStatusBadge v-if="docFor(r.document_type_id)" :status="docFor(r.document_type_id).verification_status" />
            </div>
            <template v-if="docFor(r.document_type_id)">
              <p class="mt-1 text-sm break-all text-slate-600">
                <button class="text-primary hover:underline" @click="openDoc(docFor(r.document_type_id))">{{ docFor(r.document_type_id).original_name }}</button>
                · {{ formatBytes(docFor(r.document_type_id).size_bytes) }}
              </p>
              <p v-if="docFor(r.document_type_id).notes" class="mt-1 text-sm text-red-800">Catatan panitia: {{ docFor(r.document_type_id).notes }}</p>
            </template>
            <div class="mt-2 flex flex-wrap items-start gap-2">
              <FileUpload
                v-if="canReplaceDocument(reg.status, docFor(r.document_type_id)?.verification_status ?? null)"
                :registration-id="reg.id"
                :document-type-id="r.document_type_id"
                :label="docFor(r.document_type_id) ? 'Ganti file' : 'Unggah file'"
                @uploaded="reload"
              />
              <Button v-if="isDraft && docFor(r.document_type_id)" variant="ghost" size="sm" @click="removeDoc(docFor(r.document_type_id))">Hapus</Button>
            </div>
          </li>
          <li v-if="!reg.requirements.length" class="py-3 text-sm text-slate-500">Event ini tidak mensyaratkan dokumen.</li>
        </ul>
        <div v-if="isDraft" class="mt-4 flex gap-2">
          <Button v-if="step > 0" variant="secondary" @click="step--">Kembali</Button>
          <Button @click="step++">Lanjut</Button>
        </div>
      </Card>

      <Card v-if="isDraft && stepName === 'Tinjau dan kirim'" title="Tinjau dan kirim">
        <dl class="space-y-2 text-sm">
          <div v-if="needsProgram"><dt class="text-slate-500">Program</dt><dd>{{ reg.program_name ?? "Belum dipilih" }}</dd></div>
          <div>
            <dt class="text-slate-500">Dokumen</dt>
            <dd><ul class="list-disc pl-5"><li v-for="d in reg.documents" :key="d.id">{{ d.document_type_name }}: {{ d.original_name }}</li></ul><span v-if="!reg.documents.length">Belum ada.</span></dd>
          </div>
        </dl>
        <p v-if="programMissing" class="mt-3 text-sm text-red-700">Program wajib dipilih.</p>
        <p v-if="missing.length" class="mt-3 text-sm text-red-700">Dokumen wajib belum lengkap: {{ missing.map((m: any) => m.name).join(", ") }}.</p>
        <p v-if="submitError" class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{{ submitError }}. Draft Anda tetap tersimpan.</p>
        <div class="mt-4 flex gap-2">
          <Button variant="secondary" @click="step--">Kembali</Button>
          <Button :loading="busy" :disabled="missing.length > 0 || programMissing" @click="submit"><i class="fa-solid fa-paper-plane" aria-hidden="true" /> Kirim pendaftaran</Button>
        </div>
      </Card>

      <div v-if="!isDraft" class="mt-4 flex flex-wrap gap-4 text-sm">
        <RouterLink :to="`/me/registrations/${reg.id}/receipt`" class="font-medium text-primary hover:underline">Bukti pendaftaran</RouterLink>
        <RouterLink to="/me" class="font-medium text-primary hover:underline">Kembali ke Pendaftaran Saya</RouterLink>
      </div>
    </template>
  </AsyncState>
</template>

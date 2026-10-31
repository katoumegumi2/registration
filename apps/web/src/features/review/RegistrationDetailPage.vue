<script setup lang="ts">
import { canVerifyDocument, STATUS_LABELS, type RegistrationStatus } from "@pendaftaran/shared";
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import AsyncState from "@/components/data/AsyncState.vue";
import DocStatusBadge from "@/components/data/DocStatusBadge.vue";
import StatusBadge from "@/components/data/StatusBadge.vue";
import SelectInput from "@/components/form/SelectInput.vue";
import TextInput from "@/components/form/TextInput.vue";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import Dialog from "@/components/ui/Dialog.vue";
import { api, ApiError, errorMessage } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useToast } from "@/composables/useFeedback";
import { formatBytes, formatTanggal, formatTanggalWIB } from "@/utils/format";

const route = useRoute();
const auth = useAuth();
const toast = useToast();
const id = computed(() => String(route.params.id));
const reg = ref<any>(null);
const loading = ref(true);
const error = ref("");
const busy = ref(false);

const preview = reactive({ open: false, url: "", mime: "", title: "" });
const verifyDlg = reactive({ open: false, doc: null as any, status: "VALID", notes: "", error: "" });
const statusDlg = reactive({ open: false, t: null as any, notes: "", error: "" });
const newProgram = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    reg.value = await api.get(`/admin/registrations/${id.value}`);
    newProgram.value = reg.value.program_id ?? "";
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const canVerify = computed(() => reg.value && canVerifyDocument(reg.value.status));
const statusLabel = (s: string) => STATUS_LABELS[s as RegistrationStatus] ?? s;
const ACTION_LABELS: Record<string, string> = { UNDER_REVIEW: "Mulai tinjau", ACCEPTED: "Terima", REJECTED: "Tolak", WAITING_LIST: "Waiting List" };
const actionLabel = (t: any) => (t?.correction ? `Koreksi: kembalikan ke ${statusLabel(t.to)}` : (ACTION_LABELS[t?.to] ?? ""));

async function openDoc(d: any) {
  try {
    const r = await api.get(`/admin/documents/${d.id}/url`);
    if (r.attachment_only) window.open(r.url, "_blank", "noopener");
    else Object.assign(preview, { open: true, url: r.url, mime: r.mime_type, title: `${d.document_type_name}: ${d.original_name}` });
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

function startVerify(d: any, status: "VALID" | "INVALID") {
  Object.assign(verifyDlg, { open: true, doc: d, status, notes: status === "INVALID" ? "" : (d.notes ?? ""), error: "" });
}

async function saveVerify() {
  busy.value = true;
  verifyDlg.error = "";
  try {
    await api.patch(`/admin/documents/${verifyDlg.doc.id}/verification`, { status: verifyDlg.status, notes: verifyDlg.notes || null });
    verifyDlg.open = false;
    toast.success(verifyDlg.status === "INVALID" ? "Ditandai tidak valid, pendaftar diberi tahu lewat email" : "Dokumen ditandai valid");
    await load();
  } catch (e) {
    verifyDlg.error = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

function startStatus(t: any) {
  Object.assign(statusDlg, { open: true, t, notes: "", error: "" });
}

async function saveStatus() {
  busy.value = true;
  statusDlg.error = "";
  try {
    reg.value = await api.post(`/admin/registrations/${id.value}/transitions`, { to: statusDlg.t.to, notes: statusDlg.notes || null });
    statusDlg.open = false;
    toast.success(`Status diubah ke ${statusLabel(reg.value.status)}`);
  } catch (e) {
    // Data berubah sejak halaman dibuka (MP-05).
    if (e instanceof ApiError && e.code === "INVALID_TRANSITION") statusDlg.error = "Data sudah berubah sejak halaman dibuka. Muat ulang lalu coba lagi.";
    else statusDlg.error = errorMessage(e);
    await load();
  } finally {
    busy.value = false;
  }
}

async function moveProgram() {
  busy.value = true;
  try {
    reg.value = await api.patch(`/admin/registrations/${id.value}/program`, { program_id: newProgram.value });
    toast.success("Program dipindahkan");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AsyncState :loading="loading" :error="error" @retry="load">
    <template v-if="reg">
      <RouterLink to="/admin/registrations" class="text-sm text-primary hover:underline"><i class="fa-solid fa-arrow-left mr-1" aria-hidden="true" />Daftar pendaftar</RouterLink>
      <div class="mt-2 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-ink">{{ reg.participant.full_name }}</h1>
          <p class="text-sm text-slate-600">{{ reg.registration_number }} · {{ reg.event.name }}<span v-if="reg.program_name"> · {{ reg.program_name }}</span></p>
        </div>
        <StatusBadge :status="reg.status" />
      </div>

      <Card v-if="reg.transitions.length" class="mb-4" title="Ubah status">
        <div class="flex flex-wrap gap-2">
          <div v-for="t in reg.transitions" :key="t.to">
            <Button :variant="t.to === 'REJECTED' ? 'danger' : t.correction ? 'secondary' : 'primary'" :disabled="!!t.disabled_reason" @click="startStatus(t)">
              {{ actionLabel(t) }}
            </Button>
            <p v-if="t.disabled_reason" class="mt-1 max-w-56 text-xs text-slate-600">{{ t.disabled_reason }}</p>
          </div>
        </div>
      </Card>

      <div class="grid gap-4 xl:grid-cols-3">
        <div class="space-y-4 xl:col-span-2">
          <Card title="Dokumen">
            <ul class="divide-y divide-slate-100">
              <li v-for="d in reg.documents" :key="d.id" class="py-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="min-w-0">
                    <span class="font-medium text-ink">{{ d.document_type_name }}</span>
                    <Badge v-if="d.replaced_at" class="ml-2" tone="yellow"><i class="fa-solid fa-rotate" aria-hidden="true" /> Diperbarui</Badge>
                    <p class="text-sm break-all text-slate-600">{{ d.original_name }} · {{ formatBytes(d.size_bytes) }}</p>
                    <p v-if="d.notes" class="text-sm text-red-800">Catatan: {{ d.notes }}</p>
                  </div>
                  <DocStatusBadge :status="d.verification_status" />
                </div>
                <div class="mt-2 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" @click="openDoc(d)"><i class="fa-solid" :class="d.attachment_only ? 'fa-download' : 'fa-eye'" aria-hidden="true" /> {{ d.attachment_only ? "Unduh" : "Pratinjau" }}</Button>
                  <template v-if="canVerify">
                    <Button variant="secondary" size="sm" @click="startVerify(d, 'VALID')"><i class="fa-solid fa-check" aria-hidden="true" /> Valid</Button>
                    <Button variant="secondary" size="sm" @click="startVerify(d, 'INVALID')"><i class="fa-solid fa-xmark" aria-hidden="true" /> Tidak valid</Button>
                  </template>
                </div>
              </li>
              <li v-if="!reg.documents.length" class="py-3 text-sm text-slate-500">Belum ada dokumen.</li>
            </ul>
          </Card>
          <Card title="Log aktivitas pendaftar">
            <ul class="space-y-2 text-sm">
              <li v-for="l in reg.activity_logs" :key="l.id">{{ l.description }} <span class="block text-xs text-slate-500">{{ formatTanggalWIB(l.created_at) }} · {{ l.actor_type }}</span></li>
              <li v-if="!reg.activity_logs.length" class="text-slate-500">Belum ada log.</li>
            </ul>
          </Card>
        </div>
        <div class="space-y-4">
          <Card title="Profil">
            <dl class="space-y-2 text-sm">
              <div><dt class="text-slate-500">NIK</dt><dd>{{ reg.participant.nik }}</dd></div>
              <div><dt class="text-slate-500">Email</dt><dd class="break-all">{{ reg.participant.email }}</dd></div>
              <div><dt class="text-slate-500">No. HP</dt><dd>{{ reg.participant.phone }}</dd></div>
              <div><dt class="text-slate-500">Jenis kelamin</dt><dd>{{ reg.participant.gender === "L" ? "Laki-laki" : "Perempuan" }}</dd></div>
              <div><dt class="text-slate-500">Tempat, tanggal lahir</dt><dd>{{ reg.participant.birth_place }}, {{ formatTanggal(reg.participant.birth_date) }}</dd></div>
              <div><dt class="text-slate-500">Alamat</dt><dd>{{ reg.participant.address }}</dd></div>
              <div><dt class="text-slate-500">Institusi</dt><dd>{{ reg.participant.institution ?? "—" }}</dd></div>
              <div><dt class="text-slate-500">Pendidikan</dt><dd>{{ reg.participant.education_level ?? "—" }}</dd></div>
            </dl>
          </Card>
          <Card v-if="auth.staff?.role === 'ADMIN' && reg.programs.length" title="Pindah program">
            <SelectInput v-model="newProgram" :options="reg.programs.map((p: any) => ({ value: p.id, label: p.name }))" placeholder="Pilih program" />
            <Button class="mt-2" variant="secondary" size="sm" :disabled="!newProgram || newProgram === reg.program_id" :loading="busy" @click="moveProgram">Pindahkan</Button>
          </Card>
          <Card title="Riwayat status">
            <ol class="space-y-2 border-l-2 border-slate-200 pl-3 text-sm">
              <li v-for="h in reg.history" :key="h.id"><strong>{{ statusLabel(h.to_status) }}</strong><span class="block text-xs text-slate-500">{{ formatTanggalWIB(h.changed_at) }}</span><span v-if="h.notes" class="block text-slate-600">{{ h.notes }}</span></li>
            </ol>
          </Card>
        </div>
      </div>

      <Dialog v-model:open="preview.open" :title="preview.title" wide>
        <img v-if="preview.mime.startsWith('image/')" :src="preview.url" :alt="preview.title" class="mx-auto max-h-[70vh]" />
        <iframe v-else :src="preview.url" :title="preview.title" class="h-[70vh] w-full rounded border border-slate-200" />
      </Dialog>

      <Dialog v-model:open="verifyDlg.open" :title="verifyDlg.status === 'VALID' ? 'Tandai dokumen valid' : 'Tandai dokumen tidak valid'" :description="verifyDlg.doc?.document_type_name">
        <TextInput v-model="verifyDlg.notes" multiline :label="verifyDlg.status === 'INVALID' ? 'Catatan untuk pendaftar' : 'Catatan (opsional)'" :required="verifyDlg.status === 'INVALID'" />
        <p v-if="verifyDlg.status === 'INVALID'" class="mt-2 text-xs text-slate-500">Pendaftar menerima email berisi catatan ini dan bisa mengganti berkasnya.</p>
        <p v-if="verifyDlg.error" class="mt-2 text-sm text-red-700" role="alert">{{ verifyDlg.error }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="secondary" @click="verifyDlg.open = false">Batal</Button>
          <Button :loading="busy" :disabled="verifyDlg.status === 'INVALID' && !verifyDlg.notes.trim()" @click="saveVerify">Simpan</Button>
        </div>
      </Dialog>

      <Dialog v-model:open="statusDlg.open" :title="actionLabel(statusDlg.t)" description="Pendaftar menerima email tentang perubahan ini.">
        <TextInput v-model="statusDlg.notes" multiline :label="statusDlg.t?.correction ? 'Alasan koreksi' : statusDlg.t?.notes_required ? 'Catatan' : 'Catatan (opsional)'" :required="statusDlg.t?.notes_required" />
        <p v-if="statusDlg.error" class="mt-2 text-sm text-red-700" role="alert">{{ statusDlg.error }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="secondary" @click="statusDlg.open = false">Batal</Button>
          <Button :variant="statusDlg.t?.to === 'REJECTED' ? 'danger' : 'primary'" :loading="busy" :disabled="statusDlg.t?.notes_required && !statusDlg.notes.trim()" @click="saveStatus">Ubah status</Button>
        </div>
      </Dialog>
    </template>
  </AsyncState>
</template>

<script setup lang="ts">
import { EVENT_STATUSES, EVENT_TYPES } from "@pendaftaran/shared";
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AsyncState from "@/components/data/AsyncState.vue";
import SelectInput from "@/components/form/SelectInput.vue";
import TextInput from "@/components/form/TextInput.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorFields, errorMessage } from "@/composables/useApi";
import { useToast } from "@/composables/useFeedback";
import { EVENT_TYPE_LABELS, fromWibInput, toWibInput } from "@/utils/format";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const isNew = computed(() => route.params.id === "new");
const loading = ref(!isNew.value);
const error = ref("");
const busy = ref(false);
const errors = ref<Record<string, string>>({});
const locked = ref(false);
const slotsUsed = ref(0);
const form = reactive({ name: "", type: "SEMINAR", description: "", registration_prefix: "", start_at: "", end_at: "", quota_mode: "FCFS", quota: "" as string | number, requires_program: false, status: "DRAFT" });

const programs = ref<any[]>([]);
const newProgram = ref("");
const types = ref<any[]>([]);
const reqs = reactive<Record<string, { checked: boolean; is_required: boolean }>>({});
const newType = ref("");

const statusLabels: Record<string, string> = { DRAFT: "Draft", PUBLISHED: "Dipublikasikan", CLOSED: "Ditutup" };

async function load() {
  error.value = "";
  try {
    types.value = await api.get("/admin/document-types");
    for (const t of types.value) reqs[t.id] = reqs[t.id] ?? { checked: false, is_required: true };
    if (isNew.value) return;
    const e = await api.get(`/admin/events/${route.params.id}`);
    Object.assign(form, { name: e.name, type: e.type, description: e.description, registration_prefix: e.registration_prefix, start_at: toWibInput(e.start_at), end_at: toWibInput(e.end_at), quota_mode: e.quota_mode, quota: e.quota ?? "", requires_program: e.requires_program, status: e.status });
    locked.value = e.locked;
    slotsUsed.value = e.slots_used;
    programs.value = e.programs;
    for (const r of e.requirements) reqs[r.document_type_id] = { checked: true, is_required: r.is_required };
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const requirementItems = () => Object.entries(reqs).filter(([, r]) => r.checked).map(([id, r]) => ({ document_type_id: id, is_required: r.is_required }));

async function save() {
  errors.value = {};
  if (!form.start_at || !form.end_at) {
    errors.value = { ...(form.start_at ? {} : { start_at: "Wajib diisi" }), ...(form.end_at ? {} : { end_at: "Wajib diisi" }) };
    return;
  }
  busy.value = true;
  try {
    const body = { ...form, start_at: fromWibInput(form.start_at), end_at: fromWibInput(form.end_at), quota: form.quota === "" || form.quota === null ? null : Number(form.quota) };
    const saved = isNew.value ? await api.post("/admin/events", body) : await api.patch(`/admin/events/${route.params.id}`, body);
    if (!locked.value) await api.put(`/admin/events/${saved.id}/document-requirements`, { items: requirementItems() });
    toast.success("Event disimpan");
    if (isNew.value) router.replace(`/admin/events/${saved.id}`);
  } catch (e) {
    errors.value = errorFields(e);
    toast.error(errorMessage(e));
  } finally {
    busy.value = false;
  }
}

async function addType() {
  const name = newType.value.trim();
  if (!name) return;
  // Nama yang sudah ada di master cukup dicentang.
  const existing = types.value.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    reqs[existing.id] = { checked: true, is_required: reqs[existing.id]?.is_required ?? true };
    newType.value = "";
    return;
  }
  try {
    const t = await api.post("/admin/document-types", { name });
    types.value.push(t);
    reqs[t.id] = { checked: true, is_required: true };
    newType.value = "";
    toast.success("Jenis dokumen ditambahkan");
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

async function addProgram() {
  if (!newProgram.value.trim()) return;
  try {
    programs.value.push(await api.post(`/admin/events/${route.params.id}/programs`, { name: newProgram.value.trim() }));
    newProgram.value = "";
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

async function toggleProgram(p: any) {
  try {
    Object.assign(p, await api.patch(`/admin/events/${route.params.id}/programs/${p.id}`, { is_active: !p.is_active }));
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

async function deleteProgram(p: any) {
  try {
    await api.del(`/admin/events/${route.params.id}/programs/${p.id}`);
    programs.value = programs.value.filter((x) => x.id !== p.id);
  } catch (e) {
    toast.error(errorMessage(e));
  }
}
</script>

<template>
  <RouterLink to="/admin/events" class="text-sm text-primary hover:underline"><i class="fa-solid fa-arrow-left mr-1" aria-hidden="true" />Daftar event</RouterLink>
  <h1 class="mt-2 mb-4 text-2xl font-bold text-ink">{{ isNew ? "Buat event" : form.name }}</h1>
  <AsyncState :loading="loading" :error="error" @retry="load">
    <p v-if="locked" class="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900"><i class="fa-solid fa-lock mr-1" aria-hidden="true" />Sudah ada pendaftaran yang submit. Prefix, mode kuota, dan syarat dokumen terkunci. Kuota minimal {{ slotsUsed }}.</p>
    <form class="space-y-4" novalidate @submit.prevent="save">
      <Card title="Informasi event">
        <div class="grid gap-4 md:grid-cols-2">
          <TextInput v-model="form.name" label="Nama" required :error="errors.name" class="md:col-span-2" />
          <SelectInput v-model="form.type" label="Jenis" :options="EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABELS[t]! }))" />
          <SelectInput v-model="form.status" label="Status" :options="EVENT_STATUSES.map((s) => ({ value: s, label: statusLabels[s]! }))" />
          <TextInput v-model="form.description" label="Deskripsi" multiline :error="errors.description" class="md:col-span-2" />
          <TextInput v-model="form.registration_prefix" label="Prefix nomor registrasi" required hint="2–5 huruf kapital, contoh SEM" :maxlength="5" :disabled="locked" :error="errors.registration_prefix" />
          <div />
          <TextInput v-model="form.start_at" label="Mulai (WIB)" type="datetime-local" required :error="errors.start_at" />
          <TextInput v-model="form.end_at" label="Selesai (WIB)" type="datetime-local" required :error="errors.end_at" />
          <SelectInput v-model="form.quota_mode" label="Mode kuota" :disabled="locked" :error="errors.quota_mode" :options="[{ value: 'FCFS', label: 'Siapa cepat dia dapat' }, { value: 'SELECTION', label: 'Seleksi' }]" />
          <TextInput v-model="form.quota" label="Kuota" type="number" hint="Kosongkan bila tanpa batas" :error="errors.quota" />
          <label class="flex items-center gap-2 text-sm md:col-span-2"><input v-model="form.requires_program" type="checkbox" class="size-4" /> Pendaftar wajib memilih program</label>
        </div>
      </Card>

      <Card title="Syarat dokumen">
        <ul class="space-y-2">
          <li v-for="t in types" :key="t.id" class="flex flex-wrap items-center gap-3 text-sm">
            <label class="flex min-w-48 items-center gap-2"><input v-model="reqs[t.id]!.checked" type="checkbox" class="size-4" :disabled="locked" /> {{ t.name }}</label>
            <label v-if="reqs[t.id]!.checked" class="flex items-center gap-2 text-slate-600"><input v-model="reqs[t.id]!.is_required" type="checkbox" class="size-4" :disabled="locked" /> Wajib</label>
          </li>
        </ul>
        <div v-if="!locked" class="mt-3 flex gap-2">
          <input v-model="newType" placeholder="Jenis baru, mis. Surat Persetujuan Desa" aria-label="Jenis dokumen baru" class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" @keydown.enter.prevent="addType" />
          <Button variant="secondary" @click="addType">Tambah jenis</Button>
        </div>
      </Card>

      <Button type="submit" :loading="busy">Simpan event</Button>
    </form>

    <Card v-if="!isNew" title="Program" class="mt-4">
      <ul class="divide-y divide-slate-100 text-sm">
        <li v-for="p in programs" :key="p.id" class="flex flex-wrap items-center justify-between gap-2 py-2">
          <span :class="{ 'text-slate-400 line-through': !p.is_active }">{{ p.name }}</span>
          <span>
            <Button variant="ghost" size="sm" @click="toggleProgram(p)">{{ p.is_active ? "Nonaktifkan" : "Aktifkan" }}</Button>
            <Button variant="ghost" size="sm" @click="deleteProgram(p)">Hapus</Button>
          </span>
        </li>
        <li v-if="!programs.length" class="py-2 text-slate-500">Belum ada program.</li>
      </ul>
      <div class="mt-3 flex gap-2">
        <input v-model="newProgram" placeholder="Nama program" aria-label="Nama program baru" class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" @keydown.enter.prevent="addProgram" />
        <Button variant="secondary" @click="addProgram">Tambah program</Button>
      </div>
    </Card>
    <p v-else class="mt-4 text-sm text-slate-500">Program bisa ditambahkan setelah event disimpan.</p>
  </AsyncState>
</template>

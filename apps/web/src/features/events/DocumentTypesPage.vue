<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import TextInput from "@/components/form/TextInput.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import Dialog from "@/components/ui/Dialog.vue";
import { api, errorFields, errorMessage } from "@/composables/useApi";
import { useToast } from "@/composables/useFeedback";

const toast = useToast();
const rows = ref<any[]>([]);
const loading = ref(true);
const error = ref("");
const busy = ref(false);
const dlg = reactive({ open: false, id: "", name: "", description: "", errors: {} as Record<string, string> });

async function load() {
  loading.value = true;
  error.value = "";
  try {
    rows.value = await api.get("/admin/document-types");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const edit = (t?: any) => Object.assign(dlg, { open: true, id: t?.id ?? "", name: t?.name ?? "", description: t?.description ?? "", errors: {} });

async function save() {
  busy.value = true;
  dlg.errors = {};
  try {
    const body = { name: dlg.name, description: dlg.description || null };
    if (dlg.id) await api.patch(`/admin/document-types/${dlg.id}`, body);
    else await api.post("/admin/document-types", body);
    dlg.open = false;
    toast.success("Jenis dokumen disimpan");
    await load();
  } catch (e) {
    dlg.errors = errorFields(e);
    toast.error(errorMessage(e));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-2xl font-bold text-navy">Jenis Dokumen</h1>
    <Button @click="edit()"><i class="fa-solid fa-plus" aria-hidden="true" /> Tambah</Button>
  </div>
  <Card>
    <AsyncState :loading="loading" :error="error" :empty="!rows.length" @retry="load">
      <ul class="divide-y divide-slate-100 text-sm">
        <li v-for="t in rows" :key="t.id" class="flex items-center justify-between gap-2 py-2">
          <span><strong class="text-navy">{{ t.name }}</strong><span v-if="t.description" class="block text-slate-500">{{ t.description }}</span></span>
          <Button variant="ghost" size="sm" @click="edit(t)">Ubah</Button>
        </li>
      </ul>
    </AsyncState>
  </Card>
  <Dialog v-model:open="dlg.open" :title="dlg.id ? 'Ubah jenis dokumen' : 'Tambah jenis dokumen'">
    <form class="space-y-3" novalidate @submit.prevent="save">
      <TextInput v-model="dlg.name" label="Nama" required :error="dlg.errors.name" />
      <TextInput v-model="dlg.description" label="Keterangan" multiline />
      <div class="flex justify-end gap-2 pt-2"><Button variant="secondary" @click="dlg.open = false">Batal</Button><Button type="submit" :loading="busy">Simpan</Button></div>
    </form>
  </Dialog>
</template>

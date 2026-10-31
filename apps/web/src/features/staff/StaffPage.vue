<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import SelectInput from "@/components/form/SelectInput.vue";
import TextInput from "@/components/form/TextInput.vue";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import Dialog from "@/components/ui/Dialog.vue";
import { api, errorFields, errorMessage } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useConfirm, useToast } from "@/composables/useFeedback";
import { formatTanggalWIB } from "@/utils/format";

const auth = useAuth();
const toast = useToast();
const confirm = useConfirm();
const rows = ref<any[]>([]);
const loading = ref(true);
const error = ref("");
const busy = ref(false);
const roles = [{ value: "OPERATOR", label: "Operator" }, { value: "ADMIN", label: "Admin" }];
const dlg = reactive({ open: false, id: "", username: "", full_name: "", email: "", password: "", role: "OPERATOR", errors: {} as Record<string, string> });
const pw = reactive({ open: false, id: "", username: "", password: "", error: "" });

async function load() {
  loading.value = true;
  error.value = "";
  try {
    rows.value = await api.get("/admin/staff");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function edit(s?: any) {
  Object.assign(dlg, { open: true, id: s?.id ?? "", username: s?.username ?? "", full_name: s?.full_name ?? "", email: s?.email ?? "", password: "", role: s?.role ?? "OPERATOR", errors: {} });
}

async function save() {
  busy.value = true;
  dlg.errors = {};
  try {
    const email = dlg.email || null;
    if (dlg.id) await api.patch(`/admin/staff/${dlg.id}`, { full_name: dlg.full_name, email, role: dlg.role });
    else await api.post("/admin/staff", { username: dlg.username, full_name: dlg.full_name, email, password: dlg.password, role: dlg.role });
    dlg.open = false;
    toast.success("Staff disimpan");
    await load();
  } catch (e) {
    dlg.errors = errorFields(e);
    toast.error(errorMessage(e));
  } finally {
    busy.value = false;
  }
}

async function toggle(s: any) {
  const status = s.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  if (!(await confirm({ title: status === "INACTIVE" ? "Nonaktifkan staff" : "Aktifkan staff", message: `${status === "INACTIVE" ? "Nonaktifkan" : "Aktifkan"} ${s.username}?`, danger: status === "INACTIVE" }))) return;
  try {
    await api.patch(`/admin/staff/${s.id}`, { status });
    toast.success("Status staff diubah");
    await load();
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

async function resetPw() {
  busy.value = true;
  pw.error = "";
  try {
    await api.post(`/admin/staff/${pw.id}/reset-password`, { password: pw.password });
    pw.open = false;
    toast.success("Password direset");
  } catch (e) {
    pw.error = errorFields(e).password ?? errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-2xl font-bold text-ink">Staff</h1>
    <Button @click="edit()"><i class="fa-solid fa-plus" aria-hidden="true" /> Tambah staff</Button>
  </div>
  <Card>
    <AsyncState :loading="loading" :error="error" @retry="load">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500"><tr><th class="py-2 pr-3 font-medium">Username</th><th class="pr-3 font-medium">Nama</th><th class="pr-3 font-medium">Peran</th><th class="pr-3 font-medium">Status</th><th class="pr-3 font-medium">Login terakhir</th><th class="font-medium">Aksi</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="s in rows" :key="s.id">
              <td class="py-2 pr-3 font-medium">{{ s.username }}</td><td class="pr-3">{{ s.full_name }}</td><td class="pr-3">{{ s.role }}</td>
              <td class="pr-3"><Badge :tone="s.status === 'ACTIVE' ? 'green' : 'gray'">{{ s.status === "ACTIVE" ? "Aktif" : "Nonaktif" }}</Badge></td>
              <td class="pr-3 whitespace-nowrap">{{ formatTanggalWIB(s.last_login_at) }}</td>
              <td class="whitespace-nowrap">
                <Button variant="ghost" size="sm" @click="edit(s)">Ubah</Button>
                <Button variant="ghost" size="sm" @click="Object.assign(pw, { open: true, id: s.id, username: s.username, password: '', error: '' })">Reset password</Button>
                <Button v-if="s.id !== auth.staff?.id" variant="ghost" size="sm" @click="toggle(s)">{{ s.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan" }}</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AsyncState>
  </Card>

  <Dialog v-model:open="dlg.open" :title="dlg.id ? `Ubah ${dlg.username}` : 'Tambah staff'">
    <form class="space-y-3" novalidate @submit.prevent="save">
      <TextInput v-if="!dlg.id" v-model="dlg.username" label="Username" required :error="dlg.errors.username" />
      <TextInput v-model="dlg.full_name" label="Nama lengkap" required :error="dlg.errors.full_name" />
      <TextInput v-model="dlg.email" label="Email" type="email" :error="dlg.errors.email" />
      <SelectInput v-model="dlg.role" label="Peran" :options="roles" />
      <TextInput v-if="!dlg.id" v-model="dlg.password" label="Password awal" type="password" autocomplete="new-password" required hint="Minimal 8 karakter" :error="dlg.errors.password" />
      <div class="flex justify-end gap-2 pt-2"><Button variant="secondary" @click="dlg.open = false">Batal</Button><Button type="submit" :loading="busy">Simpan</Button></div>
    </form>
  </Dialog>

  <Dialog v-model:open="pw.open" :title="`Reset password ${pw.username}`" description="Semua sesi staff ini akan dicabut.">
    <form class="space-y-3" novalidate @submit.prevent="resetPw">
      <TextInput v-model="pw.password" label="Password baru" type="password" autocomplete="new-password" required hint="Minimal 8 karakter" :error="pw.error" />
      <div class="flex justify-end gap-2 pt-2"><Button variant="secondary" @click="pw.open = false">Batal</Button><Button type="submit" :loading="busy">Reset</Button></div>
    </form>
  </Dialog>
</template>

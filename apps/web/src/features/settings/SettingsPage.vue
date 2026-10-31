<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import SelectInput from "@/components/form/SelectInput.vue";
import TextInput from "@/components/form/TextInput.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorFields, errorMessage } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useToast } from "@/composables/useFeedback";

const auth = useAuth();
const toast = useToast();
const loading = ref(true);
const error = ref("");
const busy = ref("");
const source = ref("");
const passwordSet = ref(false);
const email = reactive({ preset: "CUSTOM", host: "", port: 587 as number | string, security: "STARTTLS", auth_type: "APP_PASSWORD", username: "", password: "", from_name: "", from_address: "", reply_to: "" });
const emailErrors = ref<Record<string, string>>({});
const testTo = ref("");
const app = reactive({ app_name: "", base_url: "", contact_email: "" });
const appErrors = ref<Record<string, string>>({});

const PRESETS: Record<string, { host: string; port: number; security: string }> = {
  GMAIL: { host: "smtp.gmail.com", port: 587, security: "STARTTLS" },
  DOMAIN: { host: "mail.domain.id", port: 587, security: "STARTTLS" },
};

function applyPreset() {
  const p = PRESETS[email.preset];
  if (p) Object.assign(email, p);
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [e, a] = await Promise.all([api.get("/admin/settings/email"), api.get("/admin/settings/app")]);
    const { password_set, source: src, ...rest } = e;
    Object.assign(email, rest, { password: "" });
    passwordSet.value = password_set;
    source.value = src;
    Object.assign(app, a);
    testTo.value = auth.staff?.email ?? "";
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const emailBody = () => ({ ...email, port: Number(email.port) });

async function saveEmail() {
  busy.value = "email";
  emailErrors.value = {};
  try {
    await api.put("/admin/settings/email", emailBody());
    if (email.password) passwordSet.value = true;
    email.password = "";
    source.value = "panel";
    toast.success("Pengaturan email disimpan");
  } catch (e) {
    emailErrors.value = errorFields(e);
    toast.error(errorMessage(e));
  } finally {
    busy.value = "";
  }
}

async function sendTest() {
  busy.value = "test";
  emailErrors.value = {};
  try {
    await api.post("/admin/settings/email/test", { ...emailBody(), to: testTo.value });
    toast.success(`Email uji dikirim ke ${testTo.value}`);
  } catch (e) {
    emailErrors.value = errorFields(e);
    toast.error(errorMessage(e));
  } finally {
    busy.value = "";
  }
}

async function saveApp() {
  busy.value = "app";
  appErrors.value = {};
  try {
    await api.put("/admin/settings/app", app);
    toast.success("Pengaturan aplikasi disimpan");
  } catch (e) {
    appErrors.value = errorFields(e);
    toast.error(errorMessage(e));
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <h1 class="mb-4 text-2xl font-bold text-ink">Pengaturan</h1>
  <AsyncState :loading="loading" :error="error" @retry="load">
    <div class="space-y-4">
      <Card title="Email">
        <p v-if="source === 'env'" class="mb-3 rounded-lg bg-primary-light p-3 text-sm">Pengaturan panel belum diisi, sistem masih memakai SMTP dari file .env.</p>
        <form class="grid gap-4 md:grid-cols-2" novalidate @submit.prevent="saveEmail">
          <SelectInput v-model="email.preset" label="Preset" :options="[{ value: 'GMAIL', label: 'Gmail' }, { value: 'DOMAIN', label: 'Domain sendiri' }, { value: 'CUSTOM', label: 'Custom' }]" @update:model-value="applyPreset" />
          <SelectInput v-model="email.security" label="Keamanan" :options="[{ value: 'STARTTLS', label: 'STARTTLS' }, { value: 'TLS', label: 'TLS' }, { value: 'NONE', label: 'Tanpa enkripsi' }]" />
          <TextInput v-model="email.host" label="Host" required :error="emailErrors.host" />
          <TextInput v-model="email.port" label="Port" type="number" required :error="emailErrors.port" />
          <TextInput v-model="email.username" label="Username" :error="emailErrors.username" autocomplete="off" />
          <TextInput v-model="email.password" label="Password / App Password" type="password" autocomplete="new-password" :placeholder="passwordSet ? '••••••••' : ''" hint="Kosongkan untuk tetap memakai password lama" />
          <TextInput v-model="email.from_name" label="Nama pengirim" :error="emailErrors.from_name" />
          <TextInput v-model="email.from_address" label="Alamat pengirim" type="email" required hint="Harus sama dengan akun SMTP agar tidak masuk spam" :error="emailErrors.from_address" />
          <TextInput v-model="email.reply_to" label="Reply-To" type="email" :error="emailErrors.reply_to" />
          <TextInput v-model="testTo" label="Kirim email uji ke" type="email" :error="emailErrors.to" />
          <div class="flex flex-wrap gap-2 md:col-span-2">
            <Button variant="secondary" :loading="busy === 'test'" :disabled="!testTo" @click="sendTest"><i class="fa-solid fa-paper-plane" aria-hidden="true" /> Kirim email uji</Button>
            <Button type="submit" :loading="busy === 'email'">Simpan pengaturan email</Button>
          </div>
        </form>
      </Card>
      <Card title="Aplikasi">
        <form class="grid gap-4 md:grid-cols-2" novalidate @submit.prevent="saveApp">
          <TextInput v-model="app.app_name" label="Nama aplikasi" required :error="appErrors.app_name" />
          <TextInput v-model="app.contact_email" label="Email kontak panitia" type="email" :error="appErrors.contact_email" />
          <TextInput v-model="app.base_url" label="Base URL" hint="Dasar tautan di email. Bila kosong mengikuti APP_URL." :error="appErrors.base_url" class="md:col-span-2" />
          <div class="md:col-span-2"><Button type="submit" :loading="busy === 'app'">Simpan pengaturan aplikasi</Button></div>
        </form>
      </Card>
    </div>
  </AsyncState>
</template>

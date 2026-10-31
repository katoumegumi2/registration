<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import TextInput from "@/components/form/TextInput.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorFields, errorMessage } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useToast } from "@/composables/useFeedback";
import ProfileFields from "./ProfileFields.vue";

const auth = useAuth();
const toast = useToast();
const me = ref<any>(null);
const loading = ref(true);
const error = ref("");
const form = reactive<Record<string, any>>({});
const errors = ref<Record<string, string>>({});
const busy = ref("");
const emailForm = reactive({ email: "", code: "", sent: false });
const pwForm = reactive({ current_password: "", new_password: "" });
const pwErrors = ref<Record<string, string>>({});
const emailErrors = ref<Record<string, string>>({});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    me.value = await api.get("/me");
    Object.assign(form, { full_name: me.value.full_name, gender: me.value.gender, birth_place: me.value.birth_place, birth_date: me.value.birth_date, phone: me.value.phone, address: me.value.address, institution: me.value.institution ?? "", education_level: me.value.education_level ?? "" });
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function saveProfile() {
  errors.value = {};
  busy.value = "profile";
  try {
    auth.setParticipant(await api.patch("/me", form));
    toast.success("Profil disimpan");
  } catch (e) {
    errors.value = errorFields(e);
    toast.error(errorMessage(e));
  } finally {
    busy.value = "";
  }
}

async function requestEmail() {
  emailErrors.value = {};
  busy.value = "email";
  try {
    await api.post("/me/change-email", { email: emailForm.email });
    emailForm.sent = true;
    toast.success("Kode dikirim ke email baru");
  } catch (e) {
    emailErrors.value = errorFields(e);
    toast.error(errorMessage(e));
  } finally {
    busy.value = "";
  }
}

async function confirmEmail() {
  busy.value = "email";
  try {
    const r = await api.post("/me/change-email/verify", { code: emailForm.code });
    me.value.email = r.email;
    Object.assign(emailForm, { email: "", code: "", sent: false });
    toast.success("Email berhasil diganti");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busy.value = "";
  }
}

async function changePassword() {
  pwErrors.value = {};
  busy.value = "password";
  try {
    await api.post("/me/change-password", pwForm);
    Object.assign(pwForm, { current_password: "", new_password: "" });
    toast.success("Password diganti");
  } catch (e) {
    pwErrors.value = errorFields(e);
    toast.error(errorMessage(e));
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <h1 class="mb-4 text-2xl font-bold text-navy">Profil</h1>
  <AsyncState :loading="loading" :error="error" @retry="load">
    <div v-if="me" class="space-y-4">
      <Card title="Data diri">
        <p class="mb-4 text-sm text-slate-600">NIK <strong class="text-navy">{{ me.nik }}</strong> tidak bisa diubah.</p>
        <form novalidate @submit.prevent="saveProfile">
          <ProfileFields :form="form" :errors="errors" />
          <Button type="submit" class="mt-4" :loading="busy === 'profile'">Simpan profil</Button>
        </form>
      </Card>
      <Card title="Ganti email">
        <p class="mb-3 text-sm text-slate-600">Email saat ini: <strong class="text-navy">{{ me.email }}</strong>. Email lama tetap berlaku sampai email baru terverifikasi.</p>
        <form v-if="!emailForm.sent" class="space-y-3" novalidate @submit.prevent="requestEmail">
          <TextInput v-model="emailForm.email" label="Email baru" type="email" :error="emailErrors.email" />
          <Button type="submit" variant="secondary" :loading="busy === 'email'">Kirim kode ke email baru</Button>
        </form>
        <form v-else class="space-y-3" novalidate @submit.prevent="confirmEmail">
          <TextInput v-model="emailForm.code" :label="`Kode OTP yang dikirim ke ${emailForm.email}`" inputmode="numeric" :maxlength="6" />
          <Button type="submit" :loading="busy === 'email'">Konfirmasi email baru</Button>
        </form>
      </Card>
      <Card title="Ganti password">
        <form class="space-y-3" novalidate @submit.prevent="changePassword">
          <TextInput v-model="pwForm.current_password" label="Password lama" type="password" autocomplete="current-password" :error="pwErrors.current_password" />
          <TextInput v-model="pwForm.new_password" label="Password baru" type="password" autocomplete="new-password" hint="Minimal 8 karakter" :error="pwErrors.new_password" />
          <Button type="submit" variant="secondary" :loading="busy === 'password'">Ganti password</Button>
        </form>
      </Card>
    </div>
  </AsyncState>
</template>

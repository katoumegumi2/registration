<script setup lang="ts">
import { registerSchema } from "@pendaftaran/shared";
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import TextInput from "@/components/form/TextInput.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorFields, errorMessage } from "@/composables/useApi";
import { useToast } from "@/composables/useFeedback";
import ProfileFields from "./ProfileFields.vue";

const router = useRouter();
const toast = useToast();
const busy = ref(false);
const errors = ref<Record<string, string>>({});
const form = reactive({ nik: "", email: "", password: "", full_name: "", gender: "", phone: "", birth_place: "", birth_date: "", address: "", institution: "", education_level: "" });

async function submit() {
  errors.value = {};
  const parsed = registerSchema.safeParse(form);
  if (!parsed.success) {
    for (const i of parsed.error.issues) errors.value[i.path.join(".")] ??= i.message;
    return;
  }
  busy.value = true;
  try {
    await api.post("/auth/register", parsed.data);
    router.push({ path: "/verify", query: { email: parsed.data.email } });
  } catch (e) {
    errors.value = errorFields(e);
    toast.error(errorMessage(e));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <h1 class="mb-4 text-2xl font-bold text-ink">Daftar akun</h1>
    <form novalidate @submit.prevent="submit">
      <Card class="mb-4" title="Akun">
        <div class="grid gap-4 sm:grid-cols-2">
          <TextInput v-model="form.nik" label="NIK" required inputmode="numeric" :maxlength="16" hint="16 digit, tidak bisa diubah setelah akun dibuat" :error="errors.nik" class="sm:col-span-2" />
          <TextInput v-model="form.email" label="Email" required type="email" autocomplete="email" :error="errors.email" />
          <TextInput v-model="form.password" label="Password" required type="password" autocomplete="new-password" hint="Minimal 8 karakter" :error="errors.password" />
        </div>
      </Card>
      <Card class="mb-4" title="Data diri"><ProfileFields :form="form" :errors="errors" /></Card>
      <Button type="submit" :loading="busy" class="w-full sm:w-auto">Daftar dan kirim kode OTP</Button>
      <p class="mt-3 text-sm text-slate-600">Sudah punya akun? <RouterLink to="/login" class="text-primary hover:underline">Masuk</RouterLink></p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import TextInput from "@/components/form/TextInput.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorFields, errorMessage } from "@/composables/useApi";
import { useToast } from "@/composables/useFeedback";

const router = useRouter();
const toast = useToast();
const step = ref<"email" | "reset">("email");
const form = reactive({ email: "", code: "", password: "" });
const error = ref("");
const fields = ref<Record<string, string>>({});
const busy = ref(false);

async function send() {
  error.value = "";
  busy.value = true;
  try {
    await api.post("/auth/forgot-password", { email: form.email });
    step.value = "reset";
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function reset() {
  error.value = "";
  fields.value = {};
  busy.value = true;
  try {
    await api.post("/auth/reset-password", form);
    toast.success("Password berhasil diganti. Silakan masuk.");
    router.push("/login");
  } catch (e) {
    error.value = errorMessage(e);
    fields.value = errorFields(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <Card title="Lupa password">
      <form v-if="step === 'email'" class="space-y-4" novalidate @submit.prevent="send">
        <p class="text-sm text-slate-600">Masukkan email akun Anda. Bila terdaftar, kami kirim kode OTP untuk mengganti password.</p>
        <TextInput v-model="form.email" label="Email" type="email" required />
        <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>
        <Button type="submit" :loading="busy" class="w-full">Kirim kode</Button>
      </form>
      <form v-else class="space-y-4" novalidate @submit.prevent="reset">
        <p class="text-sm text-slate-600">Bila email terdaftar, kode OTP sudah dikirim ke {{ form.email }}.</p>
        <TextInput v-model="form.code" label="Kode OTP" required inputmode="numeric" :maxlength="6" :error="fields.code" />
        <TextInput v-model="form.password" label="Password baru" required type="password" autocomplete="new-password" hint="Minimal 8 karakter" :error="fields.password" />
        <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>
        <Button type="submit" :loading="busy" class="w-full">Ganti password</Button>
      </form>
    </Card>
  </div>
</template>

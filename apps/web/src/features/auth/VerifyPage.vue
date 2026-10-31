<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import TextInput from "@/components/form/TextInput.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorMessage } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useToast } from "@/composables/useFeedback";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const toast = useToast();
const email = ref(String(route.query.email ?? ""));
const code = ref("");
const error = ref("");
const busy = ref(false);
const cooldown = ref(60);
let timer: ReturnType<typeof setInterval>;

onMounted(() => (timer = setInterval(() => cooldown.value > 0 && cooldown.value--, 1000)));
onUnmounted(() => clearInterval(timer));

async function verify() {
  error.value = "";
  busy.value = true;
  try {
    auth.setParticipant(await api.post("/auth/verify-email", { email: email.value, code: code.value }));
    toast.success("Email terverifikasi");
    router.push("/me");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function resend() {
  try {
    await api.post("/auth/resend-otp", { email: email.value });
    cooldown.value = 60;
    toast.success("Kode baru sudah dikirim");
  } catch (e) {
    toast.error(errorMessage(e));
  }
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <Card title="Verifikasi email">
      <p class="mb-4 text-sm text-slate-600">Masukkan kode 6 digit yang kami kirim ke email Anda. Kode berlaku 10 menit.</p>
      <form class="space-y-4" novalidate @submit.prevent="verify">
        <TextInput v-model="email" label="Email" type="email" required />
        <TextInput v-model="code" label="Kode OTP" required inputmode="numeric" autocomplete="one-time-code" :maxlength="6" :error="error" />
        <Button type="submit" :loading="busy" :disabled="code.length !== 6" class="w-full">Verifikasi</Button>
      </form>
      <button class="mt-4 text-sm text-primary hover:underline disabled:text-slate-400 disabled:no-underline" :disabled="cooldown > 0 || !email" @click="resend">
        {{ cooldown > 0 ? `Kirim ulang dalam ${cooldown} detik` : "Kirim ulang kode" }}
      </button>
    </Card>
  </div>
</template>

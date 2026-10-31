<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import TextInput from "@/components/form/TextInput.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, ApiError, errorMessage } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const form = reactive({ email: "", password: "" });
const error = ref("");
const busy = ref(false);

async function submit() {
  error.value = "";
  busy.value = true;
  try {
    auth.setParticipant(await api.post("/auth/login", form));
    const next = String(route.query.next ?? "/me");
    // Hanya path internal, supaya parameter next tidak bisa mengarah ke situs lain.
    router.push(next.startsWith("/") && !next.startsWith("//") ? next : "/me");
  } catch (e) {
    if (e instanceof ApiError && e.code === "EMAIL_NOT_VERIFIED") return void router.push({ path: "/verify", query: { email: form.email } });
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <Card title="Masuk">
      <form class="space-y-4" novalidate @submit.prevent="submit">
        <TextInput v-model="form.email" label="Email" type="email" autocomplete="email" required />
        <TextInput v-model="form.password" label="Password" type="password" autocomplete="current-password" required />
        <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>
        <Button type="submit" :loading="busy" class="w-full">Masuk</Button>
      </form>
      <div class="mt-4 flex justify-between text-sm">
        <RouterLink to="/forgot-password" class="text-primary hover:underline">Lupa password?</RouterLink>
        <RouterLink to="/register" class="text-primary hover:underline">Daftar akun</RouterLink>
      </div>
    </Card>
  </div>
</template>

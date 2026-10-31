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
const form = reactive({ identifier: "", password: "" });
const error = ref("");
const busy = ref(false);

/** Hanya path internal yang sesuai jenis akun, supaya next tidak bisa mengarah ke tempat lain. */
function destination(type: "STAFF" | "PARTICIPANT") {
  const next = String(route.query.next ?? "");
  const internal = next.startsWith("/") && !next.startsWith("//");
  if (type === "STAFF") return internal && next.startsWith("/admin") ? next : "/admin";
  return internal && !next.startsWith("/admin") ? next : "/me";
}

async function submit() {
  error.value = "";
  busy.value = true;
  try {
    const r = await api.post("/auth/login", form);
    if (r.type === "STAFF") auth.setStaff(r.user);
    else auth.setParticipant(r.user);
    router.push(destination(r.type));
  } catch (e) {
    if (e instanceof ApiError && e.code === "EMAIL_NOT_VERIFIED") return void router.push({ path: "/verify", query: { email: form.identifier } });
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
        <TextInput v-model="form.identifier" label="Email atau username" autocomplete="username" required />
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

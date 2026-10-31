<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import TextInput from "@/components/form/TextInput.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import { api, errorMessage } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const form = reactive({ username: "", password: "" });
const error = ref("");
const busy = ref(false);

async function submit() {
  error.value = "";
  busy.value = true;
  try {
    auth.setStaff(await api.post("/admin/auth/login", form));
    const next = String(route.query.next ?? "/admin");
    router.push(next.startsWith("/admin") ? next : "/admin");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-navy p-4">
    <Card title="Login Panitia" class="w-full max-w-sm">
      <form class="space-y-4" novalidate @submit.prevent="submit">
        <TextInput v-model="form.username" label="Username" autocomplete="username" required />
        <TextInput v-model="form.password" label="Password" type="password" autocomplete="current-password" required />
        <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>
        <Button type="submit" :loading="busy" class="w-full">Masuk</Button>
      </form>
    </Card>
  </div>
</template>

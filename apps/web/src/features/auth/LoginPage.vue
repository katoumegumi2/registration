<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "@/components/ui/Button.vue";
import { api, ApiError, errorMessage } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { formatTanggal } from "@/utils/format";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const form = reactive({ identifier: "", password: "" });
const error = ref("");
const busy = ref(false);
const openEvents = ref<any[]>([]);

onMounted(async () => {
  const events = await api.get<any[]>("/events").catch(() => []);
  openEvents.value = events.filter((e) => e.is_open).slice(0, 3);
});

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

const labelCls = "block text-xs font-medium tracking-wide text-slate-500 uppercase";
const inputCls = "mt-1 w-full border-0 border-b-2 border-slate-300 bg-transparent px-0 py-2 text-sm text-ink transition-colors outline-none focus:border-primary";
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-4 sm:p-8">
    <div class="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl md:min-h-[38rem] md:grid-cols-2">
      <!-- Panel kiri berisi event sungguhan; disembunyikan di HP agar form langsung terlihat -->
      <aside class="relative hidden flex-col overflow-hidden rounded-3xl bg-lime p-10 text-ink md:flex md:rounded-r-[6rem]">
        <div class="pointer-events-none absolute -right-40 -bottom-40 size-[30rem] rounded-full border-2 border-forest/25" aria-hidden="true" />
        <div class="pointer-events-none absolute -right-20 -bottom-20 size-[20rem] rounded-full border-2 border-forest/25" aria-hidden="true" />
        <p class="relative text-[2.75rem] leading-[1.05] font-bold tracking-tight">Satu akun untuk semua pendaftaran.</p>
        <div class="relative mt-auto max-w-xs pt-10">
          <p class="border-b border-ink/40 pb-2 text-sm font-semibold">Sedang dibuka</p>
          <ul v-if="openEvents.length">
            <li v-for="e in openEvents" :key="e.id" class="border-b border-ink/20">
              <RouterLink :to="`/events/${e.slug}`" class="block py-2.5 text-sm hover:underline">
                <span class="block font-medium">{{ e.name }}</span>
                <span class="text-ink/70">Sampai {{ formatTanggal(e.end_at) }}</span>
              </RouterLink>
            </li>
          </ul>
          <p v-else class="py-2.5 text-sm text-ink/70">Belum ada event yang dibuka.</p>
        </div>
      </aside>

      <!-- Form -->
      <main class="flex flex-col px-6 py-8 sm:px-12 md:py-10">
        <RouterLink to="/" class="text-center text-xl font-bold text-primary"><i class="fa-solid fa-clipboard-list mr-2" aria-hidden="true" />Sistem Pendaftaran</RouterLink>
        <div class="my-auto w-full max-w-sm self-center pt-8 md:pt-0">
          <h1 class="mb-6 text-2xl font-semibold text-ink">Masuk</h1>
          <form class="space-y-6" novalidate @submit.prevent="submit">
            <label class="block">
              <span :class="labelCls">Email atau username</span>
              <input v-model="form.identifier" :class="inputCls" autocomplete="username" required :aria-invalid="!!error" />
            </label>
            <label class="block">
              <span :class="labelCls">Password</span>
              <input v-model="form.password" :class="inputCls" type="password" autocomplete="current-password" required :aria-invalid="!!error" />
            </label>
            <div class="text-right">
              <RouterLink to="/forgot-password" class="text-sm text-primary hover:underline"><i class="fa-solid fa-lock mr-1 text-xs" aria-hidden="true" />Lupa password?</RouterLink>
            </div>
            <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{{ error }}</p>
            <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p class="text-sm text-slate-600">Belum punya akun? <RouterLink to="/register" class="font-medium text-primary hover:underline">Daftar</RouterLink></p>
              <Button type="submit" :loading="busy">Masuk <i class="fa-solid fa-arrow-right" aria-hidden="true" /></Button>
            </div>
          </form>
        </div>
        <RouterLink to="/" class="mt-8 text-center text-sm text-slate-600 hover:text-primary md:mt-0"><i class="fa-solid fa-arrow-left mr-1" aria-hidden="true" />Kembali ke beranda</RouterLink>
      </main>
    </div>
  </div>
</template>

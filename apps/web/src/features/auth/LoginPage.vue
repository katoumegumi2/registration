<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "@/components/ui/Button.vue";
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

const labelCls = "block text-xs font-medium tracking-wide text-slate-500 uppercase";
const inputCls = "mt-1 w-full border-0 border-b-2 border-slate-300 bg-transparent px-0 py-2 text-sm text-ink transition-colors outline-none focus:border-primary";
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-4 sm:p-8">
    <div class="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl md:min-h-[38rem] md:grid-cols-2">
      <!-- Panel ilustrasi: hanya hiasan, disembunyikan di HP agar form langsung terlihat -->
      <aside class="gradient-green relative hidden flex-col rounded-3xl p-8 text-ink md:flex md:rounded-r-[6rem]" aria-hidden="true">
        <svg viewBox="0 0 400 320" class="my-auto w-full" fill="none">
          <!-- Awan dan bukit -->
          <path d="M40 60c0-11 9-20 20-20 4-12 26-14 33-2 11-3 22 4 22 16 0 3-2 6-5 6H45c-3 0-5 0-5 0Z" fill="#fff" fill-opacity=".45" />
          <path d="M270 40c0-9 7-16 16-16 4-9 21-11 27-1 9-2 17 3 17 12 0 3-2 5-4 5h-52c-2 0-4 0-4 0Z" fill="#fff" fill-opacity=".45" />
          <path d="M0 262c60-58 118-66 176-34 58-52 150-60 224-8v42H0Z" fill="#0b4f1e" fill-opacity=".14" />
          <path d="M0 262h400v6H0z" fill="#171a15" />
          <!-- Kotak surat dengan amplop -->
          <path d="M52 200h6v62h-6z" fill="#171a15" />
          <path d="M28 170a12 12 0 0 1 12-12h42a12 12 0 0 1 12 12v32H28v-32Z" fill="#0b4f1e" />
          <path d="M58 150h40v26H58z" fill="#fff" />
          <path d="m58 150 20 15 20-15" stroke="#171a15" stroke-width="2" />
          <!-- Meja -->
          <path d="M126 198h216v9H126z" fill="#171a15" />
          <path d="M138 207h7v55h-7zm186 0h7v55h-7z" fill="#171a15" />
          <path d="M256 207h68v42h-68z" fill="#0b4f1e" />
          <path d="M256 228h68" stroke="#b5f01e" stroke-width="2" />
          <path d="M282 216h16m-16 22h16" stroke="#b5f01e" stroke-width="3" stroke-linecap="round" />
          <!-- Monitor dengan tanda centang -->
          <path d="M214 112h96a7 7 0 0 1 7 7v62a7 7 0 0 1-7 7h-96a7 7 0 0 1-7-7v-62a7 7 0 0 1 7-7Z" fill="#171a15" />
          <path d="M216 121h92v58h-92z" fill="#fff" />
          <circle cx="262" cy="150" r="19" fill="#7ed321" />
          <path d="m253 150 7 7 12-14" stroke="#171a15" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M254 188h16v10h-16z" fill="#171a15" />
          <!-- Tumpukan berkas -->
          <path d="M146 178h44v6h-44zm3-7h44v6h-44zm-3-7h44v6h-44z" fill="#fff" stroke="#171a15" stroke-width="1.5" />
          <path d="M148 164l6-30h28l6 30z" fill="#0e5a6b" />
          <path d="M158 144h16m-18 9h20" stroke="#fff" stroke-width="2" stroke-linecap="round" />
          <!-- Tanaman -->
          <path d="M360 262v-30" stroke="#0b4f1e" stroke-width="3" />
          <path d="M360 240c-12-2-16-12-14-20 10 1 16 8 14 20Zm0-8c10-2 14-10 13-18-9 1-15 8-13 18Z" fill="#0b4f1e" />
        </svg>
        <div class="text-center text-sm">
          <p class="font-semibold">Satu akun untuk semua pendaftaran</p>
          <p class="mt-1 text-ink/70">Daftar event, unggah berkas, dan pantau statusnya dari satu tempat.</p>
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

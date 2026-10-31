<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "@/composables/useAuth";

const auth = useAuth();
const router = useRouter();
const menu = ref(false);
onMounted(() => auth.loadParticipant());

async function logout() {
  await auth.logoutParticipant();
  router.push("/");
}
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="no-print bg-navy text-white">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <RouterLink to="/" class="font-semibold"><i class="fa-solid fa-clipboard-list mr-2" aria-hidden="true" />Sistem Pendaftaran</RouterLink>
        <button class="rounded p-2 sm:hidden" aria-label="Menu" :aria-expanded="menu" @click="menu = !menu"><i class="fa-solid fa-bars" aria-hidden="true" /></button>
        <nav class="hidden items-center gap-4 text-sm sm:flex">
          <template v-if="auth.participant">
            <RouterLink to="/me" class="hover:underline">Pendaftaran Saya</RouterLink>
            <RouterLink to="/me/profile" class="hover:underline">Profil</RouterLink>
            <button class="hover:underline" @click="logout">Keluar</button>
          </template>
          <template v-else>
            <RouterLink to="/login" class="hover:underline">Masuk</RouterLink>
            <RouterLink to="/register" class="rounded-lg bg-primary px-3 py-1.5 hover:bg-blue-700">Daftar Akun</RouterLink>
          </template>
        </nav>
      </div>
      <nav v-if="menu" class="flex flex-col gap-1 border-t border-white/20 px-4 py-2 text-sm sm:hidden" @click="menu = false">
        <template v-if="auth.participant">
          <RouterLink to="/me" class="py-2">Pendaftaran Saya</RouterLink>
          <RouterLink to="/me/profile" class="py-2">Profil</RouterLink>
          <button class="py-2 text-left" @click="logout">Keluar</button>
        </template>
        <template v-else>
          <RouterLink to="/login" class="py-2">Masuk</RouterLink>
          <RouterLink to="/register" class="py-2">Daftar Akun</RouterLink>
        </template>
      </nav>
    </header>
    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6"><RouterView /></main>
    <footer class="no-print border-t border-slate-200 py-4 text-center text-xs text-slate-500">Data pribadi Anda hanya dipakai untuk keperluan pendaftaran.</footer>
  </div>
</template>

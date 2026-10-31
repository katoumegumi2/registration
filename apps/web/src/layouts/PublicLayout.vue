<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "@/composables/useAuth";

const auth = useAuth();
const route = useRoute();
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
    <header class="no-print">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <RouterLink to="/" class="text-lg font-bold text-primary"><i class="fa-solid fa-clipboard-list mr-2" aria-hidden="true" />Sistem Pendaftaran</RouterLink>
        <button class="rounded-full p-2 text-ink sm:hidden" aria-label="Menu" :aria-expanded="menu" @click="menu = !menu"><i class="fa-solid fa-bars" aria-hidden="true" /></button>
        <nav class="hidden items-center gap-5 text-sm sm:flex">
          <RouterLink to="/#event" class="hover:text-primary">Event</RouterLink>
          <template v-if="auth.participant">
            <RouterLink to="/me" class="hover:text-primary">Pendaftaran Saya</RouterLink>
            <RouterLink to="/me/profile" class="hover:text-primary">Profil</RouterLink>
            <button class="rounded-full border border-primary px-4 py-1.5 font-medium text-primary hover:bg-primary-light" @click="logout">Keluar</button>
          </template>
          <template v-else>
            <RouterLink to="/login" class="font-medium text-primary hover:underline">Masuk</RouterLink>
            <RouterLink to="/register" class="rounded-full border border-primary px-4 py-1.5 font-medium text-primary hover:bg-primary-light">Daftar Akun</RouterLink>
          </template>
        </nav>
      </div>
      <nav v-if="menu" class="mx-4 mb-2 flex flex-col gap-1 rounded-3xl bg-white p-3 text-sm sm:hidden" @click="menu = false">
        <RouterLink to="/#event" class="px-2 py-2">Event</RouterLink>
        <template v-if="auth.participant">
          <RouterLink to="/me" class="px-2 py-2">Pendaftaran Saya</RouterLink>
          <RouterLink to="/me/profile" class="px-2 py-2">Profil</RouterLink>
          <button class="px-2 py-2 text-left" @click="logout">Keluar</button>
        </template>
        <template v-else>
          <RouterLink to="/login" class="px-2 py-2">Masuk</RouterLink>
          <RouterLink to="/register" class="px-2 py-2">Daftar Akun</RouterLink>
        </template>
      </nav>
    </header>
    <main class="w-full flex-1" :class="route.meta.fullWidth ? '' : 'mx-auto max-w-6xl px-4 py-6'"><RouterView /></main>
    <footer class="no-print py-5 text-center text-xs text-slate-600">Data pribadi Anda hanya dipakai untuk keperluan pendaftaran.</footer>
  </div>
</template>

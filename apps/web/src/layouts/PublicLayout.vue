<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "@/composables/useAuth";

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const menu = ref(false);
// Halaman bertema gelap (landing): header jadi bagian atas kartu putih hero, footer diisi halaman itu sendiri.
const dark = computed(() => !!route.meta.dark);
onMounted(() => auth.loadParticipant());

async function logout() {
  await auth.logoutParticipant();
  router.push("/");
}
</script>

<template>
  <div class="flex min-h-screen flex-col" :class="dark ? 'bg-ink text-white' : ''">
    <header class="no-print" :class="dark ? 'mx-2 mt-2 rounded-t-[2.5rem] bg-white text-ink sm:mx-3 sm:mt-3' : ''">
      <div class="mx-auto max-w-6xl px-4 pt-4" :class="dark ? 'sm:pt-5' : 'pb-2'">
        <div class="grid grid-cols-[1fr_auto] items-center gap-4 rounded-full bg-ink py-2 pr-2 pl-5 text-sm text-white sm:grid-cols-[1fr_auto_1fr] sm:px-6">
          <nav class="hidden items-center gap-6 sm:flex" aria-label="Navigasi utama">
            <RouterLink to="/#event" class="text-white/75 hover:text-lime">Event</RouterLink>
            <RouterLink to="/#langkah" class="text-white/75 hover:text-lime">Cara Daftar</RouterLink>
            <RouterLink v-if="auth.participant" to="/me" class="text-white/75 hover:text-lime">Pendaftaran Saya</RouterLink>
          </nav>
          <RouterLink to="/" class="flex items-center gap-2 font-semibold sm:justify-self-center">
            <span class="flex size-7 items-center justify-center rounded-full bg-lime text-ink"><i class="fa-solid fa-clipboard-list text-xs" aria-hidden="true" /></span>
            Sistem Pendaftaran
          </RouterLink>
          <button class="flex size-9 items-center justify-center justify-self-end rounded-full bg-white/10 sm:hidden" aria-label="Menu" :aria-expanded="menu" @click="menu = !menu">
            <i class="fa-solid" :class="menu ? 'fa-xmark' : 'fa-bars'" aria-hidden="true" />
          </button>
          <nav class="hidden items-center justify-end gap-5 sm:flex">
            <template v-if="auth.participant">
              <RouterLink to="/me/profile" class="text-white/75 hover:text-lime">Profil</RouterLink>
              <button class="rounded-full border border-white/30 px-4 py-1.5 hover:bg-white/10" @click="logout">Keluar</button>
            </template>
            <template v-else>
              <RouterLink to="/login" class="text-white/75 hover:text-lime">Masuk</RouterLink>
              <RouterLink to="/register" class="rounded-full bg-lime px-4 py-1.5 font-medium text-ink hover:bg-lime-dark">Daftar Akun</RouterLink>
            </template>
          </nav>
        </div>
        <nav v-if="menu" class="mt-2 flex flex-col gap-1 rounded-3xl bg-ink p-3 text-sm text-white sm:hidden" @click="menu = false">
          <RouterLink to="/#event" class="px-2 py-2">Event</RouterLink>
          <RouterLink to="/#langkah" class="px-2 py-2">Cara Daftar</RouterLink>
          <template v-if="auth.participant">
            <RouterLink to="/me" class="px-2 py-2">Pendaftaran Saya</RouterLink>
            <RouterLink to="/me/profile" class="px-2 py-2">Profil</RouterLink>
            <button class="px-2 py-2 text-left" @click="logout">Keluar</button>
          </template>
          <template v-else>
            <RouterLink to="/login" class="px-2 py-2">Masuk</RouterLink>
            <RouterLink to="/register" class="px-2 py-2 text-lime">Daftar Akun</RouterLink>
          </template>
        </nav>
      </div>
    </header>
    <main class="w-full flex-1" :class="route.meta.fullWidth ? '' : 'mx-auto max-w-6xl px-4 py-6'"><RouterView /></main>
    <footer v-if="!dark" class="no-print py-5 text-center text-xs text-slate-600">Data pribadi Anda hanya dipakai untuk keperluan pendaftaran.</footer>
  </div>
</template>

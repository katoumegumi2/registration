<script setup lang="ts">
import { onMounted, ref } from "vue";
import AsyncState from "@/components/data/AsyncState.vue";
import EventCard from "./EventCard.vue";
import { api, errorMessage } from "@/composables/useApi";

const events = ref<any[]>([]);
const loading = ref(true);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    events.value = await api.get("/events");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <section class="mb-8 rounded-2xl bg-primary-light p-6 sm:p-8">
    <h1 class="text-2xl font-bold text-navy sm:text-3xl">Satu akun untuk semua pendaftaran</h1>
    <p class="mt-2 max-w-2xl text-slate-700">Buat akun sekali, lalu daftar ke event mana pun yang dibuka, unggah berkas, dan pantau statusnya dari satu tempat.</p>
    <ol class="mt-5 grid gap-3 text-sm sm:grid-cols-4">
      <li v-for="(s, i) in ['Buat akun dan verifikasi email', 'Pilih event yang dibuka', 'Unggah berkas lalu kirim', 'Pantau status di Pendaftaran Saya']" :key="s" class="rounded-lg bg-white p-3">
        <span class="font-semibold text-primary">{{ i + 1 }}.</span> {{ s }}
      </li>
    </ol>
  </section>

  <h2 class="mb-3 text-xl font-semibold text-navy">Event</h2>
  <AsyncState :loading="loading" :error="error" :empty="!events.length" empty-text="Belum ada event yang dibuka." @retry="load">
    <div class="grid gap-4 sm:grid-cols-2">
      <EventCard v-for="e in events" :key="e.id" :event="e" />
    </div>
  </AsyncState>
</template>

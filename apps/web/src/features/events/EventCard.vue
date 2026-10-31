<script setup lang="ts">
import { computed } from "vue";
import { EVENT_TYPE_LABELS, formatTanggal } from "@/utils/format";

const props = defineProps<{ event: any; index?: number }>();

// Warna tile bergantian; semuanya cukup terang untuk teks gelap.
const TONES = ["#7ed321", "#a5e81e", "#c4f25a", "#dcefa0"];
const tone = computed(() => TONES[(props.index ?? 0) % TONES.length]);
const ICONS: Record<string, string> = { PMB: "fa-graduation-cap", PELATIHAN: "fa-chalkboard-user", SEMINAR: "fa-microphone-lines", KEGIATAN: "fa-people-group" };
</script>

<template>
  <RouterLink :to="`/events/${event.slug}`" class="relative flex min-h-64 flex-col overflow-hidden rounded-3xl p-5 text-ink transition-transform hover:-translate-y-1" :style="{ backgroundColor: tone }">
    <i class="fa-solid absolute -right-4 -bottom-6 text-[9rem] text-ink/10" :class="ICONS[event.type]" aria-hidden="true" />
    <div class="relative flex flex-wrap gap-2 text-xs font-medium">
      <span class="rounded-full bg-ink px-3 py-1 text-white">{{ EVENT_TYPE_LABELS[event.type] }}</span>
      <span class="rounded-full border border-ink/40 px-3 py-1">{{ event.is_open ? "Buka" : event.is_full ? "Penuh" : "Tutup" }}</span>
    </div>
    <h3 class="relative mt-4 text-xl leading-snug font-semibold">{{ event.name }}</h3>
    <div class="relative mt-auto space-y-1 pt-6 text-sm">
      <p><i class="fa-regular fa-calendar mr-1.5" aria-hidden="true" />{{ formatTanggal(event.start_at) }} – {{ formatTanggal(event.end_at) }}</p>
      <p>
        <i class="fa-solid fa-users mr-1.5" aria-hidden="true" />
        <template v-if="event.quota_mode === 'SELECTION'">Seleksi</template>
        <template v-else-if="event.remaining === null">Tanpa batas kuota</template>
        <template v-else>Sisa kuota {{ event.remaining }} dari {{ event.quota }}</template>
      </p>
    </div>
  </RouterLink>
</template>

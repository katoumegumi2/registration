<script setup lang="ts">
import Badge from "@/components/ui/Badge.vue";
import { EVENT_TYPE_LABELS, formatTanggal } from "@/utils/format";

defineProps<{ event: any }>();
</script>

<template>
  <RouterLink :to="`/events/${event.slug}`" class="block rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md">
    <div class="mb-2 flex flex-wrap gap-2">
      <Badge tone="blue">{{ EVENT_TYPE_LABELS[event.type] }}</Badge>
      <Badge :tone="event.is_open ? 'green' : 'gray'">{{ event.is_open ? "Buka" : event.is_full ? "Penuh" : "Tutup" }}</Badge>
    </div>
    <h3 class="font-semibold text-navy">{{ event.name }}</h3>
    <p class="mt-1 text-sm text-slate-600"><i class="fa-regular fa-calendar mr-1" aria-hidden="true" />{{ formatTanggal(event.start_at) }} – {{ formatTanggal(event.end_at) }}</p>
    <p class="mt-1 text-sm text-slate-600">
      <i class="fa-solid fa-users mr-1" aria-hidden="true" />
      <template v-if="event.quota_mode === 'SELECTION'">Seleksi</template>
      <template v-else-if="event.remaining === null">Tanpa batas kuota</template>
      <template v-else>Sisa kuota {{ event.remaining }} dari {{ event.quota }}</template>
    </p>
  </RouterLink>
</template>

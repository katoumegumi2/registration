<script setup lang="ts">
import { computed, ref } from "vue";
import Card from "@/components/ui/Card.vue";
import { formatTanggal } from "@/utils/format";

const props = defineProps<{ events: { event_id: string; name: string; end_at: string }[] }>();

const wibDate = (d: Date | string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date(d));
const today = wibDate(new Date());
const year = ref(Number(today.slice(0, 4)));
const month = ref(Number(today.slice(5, 7)) - 1);

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const title = computed(() => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year.value, month.value, 1))));

const deadlines = computed(() => {
  const map = new Map<string, string[]>();
  for (const e of props.events) {
    const key = wibDate(e.end_at);
    map.set(key, [...(map.get(key) ?? []), e.name]);
  }
  return map;
});

const cells = computed(() => {
  const first = new Date(Date.UTC(year.value, month.value, 1));
  const blanks = (first.getUTCDay() + 6) % 7; // Minggu pertama dimulai hari Senin.
  const total = new Date(Date.UTC(year.value, month.value + 1, 0)).getUTCDate();
  const days = Array.from({ length: total }, (_, i) => {
    const key = `${year.value}-${String(month.value + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    return { key, day: i + 1, isToday: key === today, names: deadlines.value.get(key) ?? [] };
  });
  return [...Array.from({ length: blanks }, () => null), ...days];
});

function shift(delta: number) {
  const d = new Date(Date.UTC(year.value, month.value + delta, 1));
  year.value = d.getUTCFullYear();
  month.value = d.getUTCMonth();
}

const daysLeft = (end: string) => {
  const n = Math.round((Date.parse(wibDate(end)) - Date.parse(today)) / 86_400_000);
  return n <= 0 ? "Hari ini" : `${n} hari lagi`;
};
const sorted = computed(() => [...props.events].sort((a, b) => a.end_at.localeCompare(b.end_at)));
</script>

<template>
  <Card>
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-lg font-semibold text-ink capitalize">{{ title }}</h2>
      <div class="flex gap-1">
        <button class="size-8 rounded-full hover:bg-slate-100" aria-label="Bulan sebelumnya" @click="shift(-1)"><i class="fa-solid fa-chevron-left text-xs" aria-hidden="true" /></button>
        <button class="size-8 rounded-full hover:bg-slate-100" aria-label="Bulan berikutnya" @click="shift(1)"><i class="fa-solid fa-chevron-right text-xs" aria-hidden="true" /></button>
      </div>
    </div>
    <div class="grid grid-cols-7 gap-y-1 text-center text-xs">
      <span v-for="w in WEEKDAYS" :key="w" class="py-1 text-slate-500">{{ w }}</span>
      <template v-for="(c, i) in cells" :key="c?.key ?? `kosong-${i}`">
        <span v-if="!c" />
        <span
          v-else
          class="mx-auto flex size-8 items-center justify-center rounded-full"
          :class="c.names.length ? 'bg-forest font-semibold text-white' : c.isToday ? 'bg-lime font-semibold text-ink' : 'text-ink'"
          :title="c.names.length ? `Tenggat: ${c.names.join(', ')}` : undefined"
          :aria-label="c.names.length ? `${c.day}, tenggat ${c.names.join(', ')}` : undefined"
        >{{ c.day }}</span>
      </template>
    </div>
    <div class="mt-3 flex gap-4 text-xs text-slate-600">
      <span><span class="mr-1 inline-block size-2.5 rounded-full bg-lime align-middle" />Hari ini</span>
      <span><span class="mr-1 inline-block size-2.5 rounded-full bg-forest align-middle" />Tenggat event</span>
    </div>
    <ul class="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
      <li v-for="e in sorted" :key="e.event_id" class="flex items-start justify-between gap-3">
        <span class="min-w-0"><span class="block font-medium text-ink">{{ e.name }}</span><span class="text-xs text-slate-500">Ditutup {{ formatTanggal(e.end_at) }}</span></span>
        <span class="shrink-0 text-xs font-medium text-primary">{{ daysLeft(e.end_at) }}</span>
      </li>
      <li v-if="!sorted.length" class="text-slate-500">Tidak ada event yang sedang buka.</li>
    </ul>
  </Card>
</template>

<script setup lang="ts">
defineProps<{ label: string; value: number | string; icon?: string; dark?: boolean; hint?: string }>();
</script>

<template>
  <div class="rounded-3xl p-4" :class="dark ? 'bg-ink text-white' : 'border border-black/5 bg-white'">
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm" :class="dark ? 'text-white/70' : 'text-slate-600'">{{ label }}</span>
      <span v-if="icon" class="flex size-8 shrink-0 items-center justify-center rounded-full text-sm" :class="dark ? 'bg-lime text-ink' : 'bg-primary-light text-forest'"><i class="fa-solid" :class="icon" aria-hidden="true" /></span>
    </div>
    <div class="mt-1 text-3xl font-semibold" :class="dark ? 'text-white' : 'text-ink'">{{ value }}</div>
    <p v-if="hint" class="mt-1 text-xs" :class="dark ? 'text-white/60' : 'text-slate-500'">{{ hint }}</p>
  </div>
</template>

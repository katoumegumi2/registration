<script setup lang="ts">
defineProps<{ label: string; value: number | string; icon?: string; dark?: boolean }>();
</script>

<template>
  <div class="rounded-3xl p-4" :class="dark ? 'bg-ink text-white' : 'border border-black/5 bg-white'">
    <div class="flex items-center gap-2 text-sm" :class="dark ? 'text-white/70' : 'text-slate-600'"><i v-if="icon" class="fa-solid" :class="[icon, dark ? 'text-lime' : '']" aria-hidden="true" />{{ label }}</div>
    <div class="mt-1 text-3xl font-semibold" :class="dark ? 'text-white' : 'text-ink'">{{ value }}</div>
  </div>
</template>

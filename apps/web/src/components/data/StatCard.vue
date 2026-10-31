<script setup lang="ts">
defineProps<{ label: string; value: number | string; icon?: string }>();
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white p-4">
    <div class="flex items-center gap-2 text-sm text-slate-600"><i v-if="icon" class="fa-solid" :class="icon" aria-hidden="true" />{{ label }}</div>
    <div class="mt-1 text-2xl font-semibold text-navy">{{ value }}</div>
  </div>
</template>

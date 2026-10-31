<script setup lang="ts">
defineProps<{ label: string; error?: string; hint?: string; required?: boolean }>();
</script>

<template>
  <label class="block">
    <span class="mb-1 block text-sm font-medium text-ink">{{ label }}<span v-if="required" class="text-red-600"> *</span></span>
    <slot />
    <span v-if="hint && !error" class="mt-1 block text-xs text-slate-500">{{ hint }}</span>
    <span v-if="error" class="mt-1 block text-xs text-red-700" role="alert">{{ error }}</span>
  </label>
</template>

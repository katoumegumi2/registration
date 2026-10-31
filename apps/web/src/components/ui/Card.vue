<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <section class="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <h2 v-if="title" class="mb-3 text-base font-semibold text-navy">{{ title }}</h2>
    <slot />
  </section>
</template>

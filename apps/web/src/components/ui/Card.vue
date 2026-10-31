<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <section class="rounded-3xl border border-black/5 bg-white p-4 sm:p-6">
    <h2 v-if="title" class="mb-3 text-lg font-semibold text-ink">{{ title }}</h2>
    <slot />
  </section>
</template>

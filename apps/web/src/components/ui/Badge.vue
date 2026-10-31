<script setup lang="ts">
withDefaults(defineProps<{ tone?: "gray" | "blue" | "yellow" | "green" | "red" | "purple" }>(), { tone: "gray" });
const tones = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-blue-100 text-blue-800",
  yellow: "bg-yellow-100 text-yellow-800",
  green: "bg-green-100 text-green-800",
  red: "bg-red-100 text-red-800",
  purple: "bg-purple-100 text-purple-800",
};
</script>

<template>
  <span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap" :class="tones[tone]"><slot /></span>
</template>

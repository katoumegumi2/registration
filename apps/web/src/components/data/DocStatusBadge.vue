<script setup lang="ts">
import Badge from "@/components/ui/Badge.vue";
import { VERIFICATION_LABELS } from "@/utils/format";

defineProps<{ status: string }>();
const tone = (s: string) => (s === "VALID" ? "green" : s === "INVALID" ? "red" : "gray");
const icon = (s: string) => (s === "VALID" ? "fa-check" : s === "INVALID" ? "fa-xmark" : "fa-clock");
</script>

<template>
  <Badge :tone="tone(status)"><i class="fa-solid" :class="icon(status)" aria-hidden="true" /> {{ VERIFICATION_LABELS[status] }}</Badge>
</template>

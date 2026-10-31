<script setup lang="ts">
import { STATUS_LABELS, type RegistrationStatus } from "@pendaftaran/shared";
import Badge from "@/components/ui/Badge.vue";

defineProps<{ status: RegistrationStatus }>();
// Warna tetap sesuai PRD 9.
const tone = { DRAFT: "gray", SUBMITTED: "blue", UNDER_REVIEW: "yellow", ACCEPTED: "green", REJECTED: "red", WAITING_LIST: "purple" } as const;
</script>

<template>
  <Badge :tone="tone[status]">{{ STATUS_LABELS[status] }}</Badge>
</template>

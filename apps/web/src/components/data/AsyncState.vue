<script setup lang="ts">
import Button from "@/components/ui/Button.vue";

// Setiap halaman data punya keadaan memuat, kosong, dan error (PRD 9).
defineProps<{ loading?: boolean; error?: string; empty?: boolean; emptyText?: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="loading" class="py-12 text-center text-slate-500" role="status"><i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true" />Memuat…</div>
  <div v-else-if="error" class="rounded-lg border border-red-200 bg-red-50 p-6 text-center" role="alert">
    <p class="mb-3 text-sm text-red-800"><i class="fa-solid fa-circle-exclamation mr-1" aria-hidden="true" />{{ error }}</p>
    <Button variant="secondary" size="sm" @click="$emit('retry')">Coba lagi</Button>
  </div>
  <div v-else-if="empty" class="py-12 text-center text-slate-500"><i class="fa-regular fa-folder-open mb-2 block text-2xl" aria-hidden="true" />{{ emptyText ?? "Belum ada data." }}</div>
  <slot v-else />
</template>

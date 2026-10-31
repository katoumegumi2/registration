<script setup lang="ts">
import { computed } from "vue";
import Button from "@/components/ui/Button.vue";

const props = defineProps<{ page: number; pageSize: number; total: number }>();
defineEmits<{ change: [page: number] }>();
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
</script>

<template>
  <div class="mt-4 flex items-center justify-between gap-3 text-sm text-slate-600">
    <span>{{ total }} data · halaman {{ page }} dari {{ pages }}</span>
    <div class="flex gap-2">
      <Button variant="secondary" size="sm" :disabled="page <= 1" @click="$emit('change', page - 1)">Sebelumnya</Button>
      <Button variant="secondary" size="sm" :disabled="page >= pages" @click="$emit('change', page + 1)">Berikutnya</Button>
    </div>
  </div>
</template>

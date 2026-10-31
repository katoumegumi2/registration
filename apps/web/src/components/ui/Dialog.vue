<script setup lang="ts">
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";

defineProps<{ title: string; description?: string; wide?: boolean }>();
const open = defineModel<boolean>("open", { required: true });
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-ink/60" />
      <DialogContent class="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-6 shadow-xl" :class="wide ? 'max-w-4xl' : 'max-w-md'">
        <div class="mb-3 flex items-start justify-between gap-4">
          <DialogTitle class="text-lg font-semibold text-ink">{{ title }}</DialogTitle>
          <DialogClose class="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Tutup"><i class="fa-solid fa-xmark" aria-hidden="true" /></DialogClose>
        </div>
        <DialogDescription v-if="description" class="mb-3 text-sm text-slate-600">{{ description }}</DialogDescription>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

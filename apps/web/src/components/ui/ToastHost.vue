<script setup lang="ts">
import { ToastDescription, ToastProvider, ToastRoot, ToastViewport } from "reka-ui";
import { toasts } from "@/composables/useFeedback";

const remove = (id: number) => (toasts.value = toasts.value.filter((t) => t.id !== id));
</script>

<template>
  <ToastProvider :duration="5000">
    <ToastRoot
      v-for="t in toasts"
      :key="t.id"
      class="flex items-start gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg"
      :class="t.kind === 'success' ? 'bg-green-700' : 'bg-red-700'"
      @update:open="(o: boolean) => { if (!o) remove(t.id); }"
    >
      <i class="mt-0.5 fa-solid" :class="t.kind === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'" aria-hidden="true" />
      <ToastDescription>{{ t.message }}</ToastDescription>
    </ToastRoot>
    <ToastViewport class="no-print fixed right-4 bottom-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2" />
  </ToastProvider>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { confirmState } from "@/composables/useFeedback";
import Button from "./Button.vue";
import Dialog from "./Dialog.vue";

function finish(ok: boolean) {
  confirmState.open = false;
  confirmState.resolve?.(ok);
  confirmState.resolve = null;
}
const open = computed({ get: () => confirmState.open, set: (v) => { if (!v) finish(false); } });
</script>

<template>
  <Dialog v-model:open="open" :title="confirmState.title">
    <p class="text-sm text-slate-700">{{ confirmState.message }}</p>
    <div class="mt-5 flex justify-end gap-2">
      <Button variant="secondary" @click="finish(false)">Batal</Button>
      <Button :variant="confirmState.danger ? 'danger' : 'primary'" @click="finish(true)">{{ confirmState.confirmLabel }}</Button>
    </div>
  </Dialog>
</template>

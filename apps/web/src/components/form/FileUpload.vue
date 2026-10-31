<script setup lang="ts">
import { ACCEPTED_EXTENSIONS } from "@pendaftaran/shared";
import { ref } from "vue";
import Button from "@/components/ui/Button.vue";
import { errorMessage } from "@/composables/useApi";
import { useFileUpload } from "@/composables/useFileUpload";
import { useToast } from "@/composables/useFeedback";

const props = defineProps<{ registrationId: string; documentTypeId: string; label: string }>();
const emit = defineEmits<{ uploaded: [] }>();
const input = ref<HTMLInputElement>();
const error = ref("");
const { upload, progress, uploading } = useFileUpload();
const toast = useToast();

async function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = "";
  try {
    await upload(props.registrationId, props.documentTypeId, file);
    toast.success(`${file.name} berhasil diunggah`);
    emit("uploaded");
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    if (input.value) input.value.value = "";
  }
}
</script>

<template>
  <div>
    <input ref="input" type="file" class="sr-only" :accept="ACCEPTED_EXTENSIONS.join(',')" :aria-label="label" @change="onPick" />
    <Button variant="secondary" size="sm" :loading="uploading" @click="input?.click()">
      <i class="fa-solid fa-upload" aria-hidden="true" /> {{ uploading ? `Mengunggah ${progress}%` : label }}
    </Button>
    <div v-if="uploading" class="mt-2 h-1.5 overflow-hidden rounded bg-slate-200" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
      <div class="h-full bg-chart transition-all" :style="{ width: `${progress}%` }" />
    </div>
    <p v-if="error" class="mt-1 text-xs text-red-700" role="alert">{{ error }}</p>
  </div>
</template>

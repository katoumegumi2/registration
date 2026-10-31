<script setup lang="ts">
import FormField from "./FormField.vue";

withDefaults(defineProps<{ label: string; type?: string; error?: string; hint?: string; required?: boolean; placeholder?: string; autocomplete?: string; inputmode?: "text" | "numeric" | "email" | "tel"; maxlength?: number; disabled?: boolean; multiline?: boolean }>(), { type: "text" });
const model = defineModel<string | number | null>();
const cls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-2 focus:outline-primary/30 disabled:bg-slate-100 disabled:text-slate-500";
</script>

<template>
  <FormField :label="label" :error="error" :hint="hint" :required="required">
    <textarea v-if="multiline" v-model="model as string" rows="3" :class="cls" :placeholder="placeholder" :disabled="disabled" />
    <input v-else v-model="model" :type="type" :class="cls" :placeholder="placeholder" :autocomplete="autocomplete" :inputmode="inputmode" :maxlength="maxlength" :disabled="disabled" :aria-invalid="!!error" />
  </FormField>
</template>

<script setup lang="ts">
import FormField from "./FormField.vue";

// Select bawaan browser: paling nyaman di HP, dan token warna tetap dipakai lewat class.
defineProps<{ label?: string; options: { value: string; label: string }[]; error?: string; required?: boolean; disabled?: boolean; placeholder?: string }>();
const model = defineModel<string | null>();
const cls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-2 focus:outline-primary/30 disabled:bg-slate-100";
</script>

<template>
  <FormField v-if="label" :label="label" :error="error" :required="required">
    <select v-model="model" :class="cls" :disabled="disabled">
      <option v-if="placeholder !== undefined" value="">{{ placeholder }}</option>
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
  </FormField>
  <select v-else v-model="model" :class="cls" :disabled="disabled" :aria-label="placeholder">
    <option v-if="placeholder !== undefined" value="">{{ placeholder }}</option>
    <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
  </select>
</template>

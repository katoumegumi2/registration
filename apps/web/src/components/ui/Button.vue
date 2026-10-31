<script setup lang="ts">
withDefaults(defineProps<{ variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md"; loading?: boolean; disabled?: boolean; type?: "button" | "submit" }>(), {
  variant: "primary",
  size: "md",
  type: "button",
});
const styles = {
  primary: "bg-primary text-white hover:bg-blue-700",
  secondary: "bg-white text-navy border border-slate-300 hover:bg-slate-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-primary hover:bg-primary-light",
};
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
    :class="[styles[variant], size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm']"
  >
    <i v-if="loading" class="fa-solid fa-spinner fa-spin" aria-hidden="true" />
    <slot />
  </button>
</template>

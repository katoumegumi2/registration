<script setup lang="ts">
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import ToastHost from "@/components/ui/ToastHost.vue";
</script>

<template>
  <RouterView />
  <ConfirmDialog />
  <ToastHost />
</template>

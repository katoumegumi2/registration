<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "@/composables/useAuth";

const auth = useAuth();
const router = useRouter();
const isAdmin = computed(() => auth.staff?.role === "ADMIN");

const items = computed(() => [
  { to: "/admin", label: "Dashboard", icon: "fa-gauge", exact: true },
  { to: "/admin/registrations", label: "Pendaftar", icon: "fa-users" },
  { to: "/admin/participants", label: "Akun Pendaftar", icon: "fa-id-card" },
  { to: "/admin/reports", label: "Laporan", icon: "fa-file-lines" },
  ...(isAdmin.value
    ? [
        { to: "/admin/events", label: "Event", icon: "fa-calendar-days" },
        { to: "/admin/document-types", label: "Jenis Dokumen", icon: "fa-folder-tree" },
        { to: "/admin/staff", label: "Staff", icon: "fa-user-shield" },
        { to: "/admin/activity-logs", label: "Activity Log", icon: "fa-list-check" },
        { to: "/admin/notifications", label: "Outbox Email", icon: "fa-envelope" },
        { to: "/admin/settings", label: "Pengaturan", icon: "fa-gear" },
      ]
    : []),
]);

const ACTIVE = "!bg-lime !text-ink font-medium";

async function logout() {
  await auth.logoutStaff();
  router.push("/admin/login");
}
</script>

<template>
  <div class="flex min-h-screen items-start">
    <aside class="no-print sticky top-3 m-3 mr-0 flex h-[calc(100vh-1.5rem)] w-60 shrink-0 flex-col overflow-hidden rounded-[2rem] bg-ink text-white">
      <div class="px-5 pt-5 pb-4 text-lg font-semibold"><i class="fa-solid fa-clipboard-list mr-2 text-lime" aria-hidden="true" />Panel Panitia</div>
      <nav class="min-h-0 flex-1 overflow-y-auto px-3 text-sm">
        <RouterLink
          v-for="i in items"
          :key="i.to"
          :to="i.to"
          class="mb-1 flex items-center gap-3 rounded-full px-4 py-2.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          :exact-active-class="i.exact ? ACTIVE : ''"
          :active-class="i.exact ? '' : ACTIVE"
        >
          <i class="fa-solid w-4 text-center" :class="i.icon" aria-hidden="true" />{{ i.label }}
        </RouterLink>
      </nav>
      <div class="border-t border-white/15 px-5 py-4 text-sm">
        <div class="font-medium">{{ auth.staff?.full_name }}</div>
        <div class="mb-2 text-xs text-white/60">{{ auth.staff?.role }}</div>
        <button class="text-white/80 hover:text-white hover:underline" @click="logout"><i class="fa-solid fa-right-from-bracket mr-1" aria-hidden="true" />Keluar</button>
      </div>
    </aside>
    <main class="min-w-0 flex-1 p-6"><RouterView /></main>
  </div>
</template>

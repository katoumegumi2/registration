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

async function logout() {
  await auth.logoutStaff();
  router.push("/admin/login");
}
</script>

<template>
  <div class="flex min-h-screen">
    <aside class="no-print flex w-60 shrink-0 flex-col bg-navy text-white">
      <div class="px-5 py-4 font-semibold"><i class="fa-solid fa-clipboard-list mr-2" aria-hidden="true" />Panel Panitia</div>
      <nav class="flex-1 px-2 text-sm">
        <RouterLink
          v-for="i in items"
          :key="i.to"
          :to="i.to"
          class="mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/10"
          :exact-active-class="i.exact ? 'bg-white/15' : ''"
          :active-class="i.exact ? '' : 'bg-white/15'"
        >
          <i class="fa-solid w-4 text-center" :class="i.icon" aria-hidden="true" />{{ i.label }}
        </RouterLink>
      </nav>
      <div class="border-t border-white/20 px-5 py-3 text-sm">
        <div class="font-medium">{{ auth.staff?.full_name }}</div>
        <div class="mb-2 text-xs text-white/70">{{ auth.staff?.role }}</div>
        <button class="hover:underline" @click="logout"><i class="fa-solid fa-right-from-bracket mr-1" aria-hidden="true" />Keluar</button>
      </div>
    </aside>
    <main class="min-w-0 flex-1 p-6"><RouterView /></main>
  </div>
</template>

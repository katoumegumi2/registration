import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { useAuth } from "./composables/useAuth";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: () => import("./layouts/PublicLayout.vue"),
    children: [
      { path: "", meta: { fullWidth: true }, component: () => import("./features/events/LandingPage.vue") },
      { path: "events/:slug", component: () => import("./features/events/EventDetailPage.vue") },
      { path: "register", component: () => import("./features/auth/RegisterPage.vue") },
      { path: "verify", component: () => import("./features/auth/VerifyPage.vue") },
      { path: "login", component: () => import("./features/auth/LoginPage.vue") },
      { path: "forgot-password", component: () => import("./features/auth/ForgotPasswordPage.vue") },
      { path: "me", meta: { participant: true }, component: () => import("./features/registrations/MyRegistrationsPage.vue") },
      { path: "me/profile", meta: { participant: true }, component: () => import("./features/auth/ProfilePage.vue") },
      { path: "me/registrations/:id", meta: { participant: true }, component: () => import("./features/registrations/RegistrationFormPage.vue") },
      { path: "me/registrations/:id/receipt", meta: { participant: true }, component: () => import("./features/registrations/ReceiptPage.vue") },
    ],
  },
  // Alamat lama tetap berfungsi; login sekarang satu halaman.
  { path: "/admin/login", redirect: (to) => ({ path: "/login", query: to.query }) },
  {
    path: "/admin",
    component: () => import("./layouts/AdminLayout.vue"),
    meta: { staff: true },
    children: [
      { path: "", component: () => import("./features/reports/DashboardPage.vue") },
      { path: "registrations", component: () => import("./features/review/RegistrationsPage.vue") },
      { path: "registrations/:id", component: () => import("./features/review/RegistrationDetailPage.vue") },
      { path: "participants", component: () => import("./features/staff/ParticipantsPage.vue") },
      { path: "reports", component: () => import("./features/reports/ReportsPage.vue") },
      { path: "events", meta: { admin: true }, component: () => import("./features/events/AdminEventsPage.vue") },
      { path: "events/:id", meta: { admin: true }, component: () => import("./features/events/AdminEventFormPage.vue") },
      { path: "document-types", meta: { admin: true }, component: () => import("./features/events/DocumentTypesPage.vue") },
      { path: "staff", meta: { admin: true }, component: () => import("./features/staff/StaffPage.vue") },
      { path: "activity-logs", meta: { admin: true }, component: () => import("./features/settings/ActivityLogsPage.vue") },
      { path: "notifications", meta: { admin: true }, component: () => import("./features/settings/NotificationsPage.vue") },
      { path: "settings", meta: { admin: true }, component: () => import("./features/settings/SettingsPage.vue") },
    ],
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: (to) => (to.hash ? { el: to.hash } : { top: 0 }) });

// Hanya untuk kenyamanan; hak akses sebenarnya dicek di backend (PRD 3).
router.beforeEach(async (to) => {
  const auth = useAuth();
  if (to.meta.participant && !(await auth.loadParticipant())) return { path: "/login", query: { next: to.fullPath } };
  if (to.meta.staff) {
    const s = await auth.loadStaff();
    if (!s) return { path: "/login", query: { next: to.fullPath } };
    if (to.meta.admin && s.role !== "ADMIN") return "/admin";
  }
});

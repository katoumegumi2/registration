import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "./useApi";

export const useAuth = defineStore("auth", () => {
  const participant = ref<any | null>(null);
  const staff = ref<any | null>(null);
  let participantLoaded = false;
  let staffLoaded = false;

  async function loadParticipant() {
    if (participantLoaded) return participant.value;
    participantLoaded = true;
    participant.value = await api.get("/me").catch(() => null);
    return participant.value;
  }

  async function loadStaff() {
    if (staffLoaded) return staff.value;
    staffLoaded = true;
    staff.value = await api.get("/admin/auth/me").catch(() => null);
    return staff.value;
  }

  function setParticipant(p: any) {
    participantLoaded = true;
    participant.value = p;
  }

  function setStaff(s: any) {
    staffLoaded = true;
    staff.value = s;
  }

  async function logoutParticipant() {
    await api.post("/auth/logout");
    participant.value = null;
  }

  async function logoutStaff() {
    await api.post("/admin/auth/logout");
    staff.value = null;
  }

  return { participant, staff, loadParticipant, loadStaff, setParticipant, setStaff, logoutParticipant, logoutStaff };
});

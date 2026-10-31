import { reactive, ref } from "vue";

// ---------- Toast ----------
export interface ToastItem {
  id: number;
  kind: "success" | "error";
  message: string;
}
export const toasts = ref<ToastItem[]>([]);
let nextId = 1;

export function useToast() {
  const push = (kind: ToastItem["kind"], message: string) => toasts.value.push({ id: nextId++, kind, message });
  return { success: (m: string) => push("success", m), error: (m: string) => push("error", m) };
}

// ---------- Konfirmasi ----------
export const confirmState = reactive({
  open: false,
  title: "",
  message: "",
  confirmLabel: "Ya, lanjutkan",
  danger: false,
  resolve: null as null | ((ok: boolean) => void),
});

export function useConfirm() {
  return (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => {
      Object.assign(confirmState, { open: true, confirmLabel: "Ya, lanjutkan", danger: false, ...opts, resolve });
    });
}

import { authService } from "./modules/auth";
import { documentService } from "./modules/documents";
import { notificationService } from "./modules/notifications";

const OUTBOX_MS = 5_000;
const CLEANUP_MS = 10 * 60_000;

/** Worker outbox + pembersihan unggahan. Dipanggil dari main.ts bila RUN_WORKER=true, atau berdiri sendiri. */
export function startWorker() {
  notificationService.markWorkerActive();
  const safely = (name: string, fn: () => Promise<unknown>) => () =>
    fn().catch((err) => console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", job: name, message: (err as Error).message })));
  setInterval(safely("outbox", () => notificationService.processDue()), OUTBOX_MS);
  setInterval(safely("cleanup", async () => {
    await documentService.cleanupUploads();
    await authService.purgeExpired();
  }), CLEANUP_MS);
  console.log(JSON.stringify({ t: new Date().toISOString(), msg: "Worker berjalan" }));
}

if (import.meta.main) startWorker();

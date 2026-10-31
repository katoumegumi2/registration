import { ApiError } from "../../shared/http/errors";
import { route, type App } from "../../shared/http/route";
import { documentService } from ".";

/** Hanya untuk STORAGE_DRIVER=local, pengganti presigned URL (PRD 6.6). */
export function registerLocalFileRoutes(app: App) {
  route(app, { method: "put", path: "/uploads/{token}", tag: "Berkas", summary: "Unggah ke key sementara (driver lokal, token sekali pakai)" }, async ({ c, params }) => {
    await documentService.receiveLocalUpload(params.token!, c.req.raw.body);
    return { ok: true };
  });

  route(app, { method: "get", path: "/files/{token}", tag: "Berkas", summary: "Unduh berkas (driver lokal, token 5 menit)" }, async ({ params }) => {
    const f = documentService.verifyLocalDownload(params.token!);
    if (!f) throw new ApiError(403, "FORBIDDEN", "Tautan unduh tidak berlaku");
    return new Response(f.file, { headers: { "content-type": f.mime, "content-disposition": f.disposition, "x-content-type-options": "nosniff" } });
  });
}

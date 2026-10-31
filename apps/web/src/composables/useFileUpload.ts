import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES } from "@pendaftaran/shared";
import { ref } from "vue";
import { api, ApiError } from "./useApi";

/** Alur target → PUT → konfirmasi (PRD 6.6). Tidak membedakan driver penyimpanan. */
export function useFileUpload() {
  const progress = ref(0);
  const uploading = ref(false);

  function put(target: { method: string; url: string; headers: Record<string, string> }, file: File) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(target.method, target.url);
      for (const [k, v] of Object.entries(target.headers ?? {})) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) progress.value = Math.round((e.loaded / e.total) * 100);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        if (xhr.status === 413) return reject(new ApiError(413, "FILE_REJECTED", "Ukuran file melebihi 5 MB"));
        let message = "Unggahan gagal. Coba lagi.";
        try {
          message = JSON.parse(xhr.responseText)?.error?.message ?? message;
        } catch {}
        reject(new ApiError(xhr.status, "FILE_REJECTED", message));
      };
      xhr.onerror = () => reject(new ApiError(0, "NETWORK", "Koneksi terputus saat mengunggah"));
      xhr.send(file);
    });
  }

  async function upload(registrationId: string, documentTypeId: string, file: File) {
    if (file.size > MAX_FILE_BYTES) throw new ApiError(422, "FILE_REJECTED", "Ukuran file melebihi 5 MB");
    const name = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((e) => name.endsWith(e))) throw new ApiError(422, "FILE_REJECTED", "Format file tidak diterima. Gunakan PDF, DOC, DOCX, JPG, atau PNG.");
    uploading.value = true;
    progress.value = 0;
    try {
      const target = await api.post(`/me/registrations/${registrationId}/uploads`, { document_type_id: documentTypeId, original_name: file.name });
      await put(target, file);
      return await api.post(`/me/registrations/${registrationId}/uploads/${target.upload_id}/confirm`);
    } finally {
      uploading.value = false;
    }
  }

  return { upload, progress, uploading };
}

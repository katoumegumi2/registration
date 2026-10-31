import type { ApiErrorCode } from "@pendaftaran/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: ApiErrorCode,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = "Data") => new ApiError(404, "NOT_FOUND", `${what} tidak ditemukan`);
export const invalidTransition = (msg = "Perubahan status ini tidak diizinkan") => new ApiError(409, "INVALID_TRANSITION", msg);
export const validationError = (fields: Record<string, string>, message = "Data tidak valid") =>
  new ApiError(422, "VALIDATION_ERROR", message, fields);

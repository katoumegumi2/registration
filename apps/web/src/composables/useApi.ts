export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Tidak bisa menghubungi server. Periksa koneksi Anda.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, json?.error?.code ?? "UNKNOWN", json?.error?.message ?? "Terjadi kesalahan", json?.error?.fields ?? {});
  }
  return json?.data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>("GET", p),
  post: <T = any>(p: string, b?: unknown) => request<T>("POST", p, b),
  patch: <T = any>(p: string, b?: unknown) => request<T>("PATCH", p, b),
  put: <T = any>(p: string, b?: unknown) => request<T>("PUT", p, b),
  del: <T = any>(p: string) => request<T>("DELETE", p),
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan");
export const errorFields = (e: unknown) => (e instanceof ApiError ? e.fields : {});

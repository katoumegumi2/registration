import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { S3Client } from "bun";
import { config } from "../config";
import { signToken } from "../crypto";

export const SIGNED_URL_SECONDS = 300;
export const TEMP_PREFIX = "uploads/";

export interface UploadTarget {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
}

export type ReadResult = { kind: "ok"; bytes: Uint8Array } | { kind: "missing" } | { kind: "too_large" };

export interface DownloadOptions {
  mime: string;
  filename: string;
  attachment: boolean;
}

/** Bagi pemanggil, kedua driver sama saja (PRD 6.6). */
export interface StorageDriver {
  uploadTarget(uploadId: string, tempKey: string): UploadTarget;
  read(key: string, maxBytes: number): Promise<ReadResult>;
  write(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  delete(key: string): Promise<void>;
  downloadUrl(key: string, opts: DownloadOptions): string;
  sweepTemp(olderThanMs: number): Promise<number>;
  ping(): Promise<boolean>;
}

const disposition = (o: DownloadOptions) => {
  const safe = o.filename.replace(/[^\w.\- ]/g, "_");
  return `${o.attachment ? "attachment" : "inline"}; filename="${safe}"`;
};

class S3Driver implements StorageDriver {
  private opts = {
    bucket: config.s3.bucket,
    region: config.s3.region,
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  };
  private internal = new S3Client({ ...this.opts, endpoint: config.s3.endpoint });
  private pub = new S3Client({ ...this.opts, endpoint: config.s3.publicEndpoint });

  uploadTarget(_uploadId: string, tempKey: string): UploadTarget {
    return { method: "PUT", url: this.pub.presign(tempKey, { method: "PUT", expiresIn: SIGNED_URL_SECONDS }), headers: {} };
  }

  async read(key: string, maxBytes: number): Promise<ReadResult> {
    try {
      const file = this.internal.file(key);
      const info = await file.stat();
      if (info.size > maxBytes) return { kind: "too_large" };
      return { kind: "ok", bytes: new Uint8Array(await file.arrayBuffer()) };
    } catch {
      return { kind: "missing" };
    }
  }

  async write(key: string, bytes: Uint8Array, mime: string) {
    await this.internal.write(key, bytes, { type: mime });
  }

  async delete(key: string) {
    await this.internal.delete(key).catch(() => {});
  }

  downloadUrl(key: string, o: DownloadOptions): string {
    return this.pub.presign(key, { method: "GET", expiresIn: SIGNED_URL_SECONDS, type: o.mime, contentDisposition: disposition(o) });
  }

  async sweepTemp(olderThanMs: number) {
    const res = await this.internal.list({ prefix: TEMP_PREFIX, maxKeys: 500 });
    let removed = 0;
    for (const o of res.contents ?? []) {
      if (o.lastModified && Date.now() - new Date(o.lastModified).getTime() > olderThanMs) {
        await this.delete(o.key);
        removed++;
      }
    }
    return removed;
  }

  async ping() {
    try {
      await this.internal.list({ maxKeys: 1 });
      return true;
    } catch {
      return false;
    }
  }
}

export class LocalDriver implements StorageDriver {
  private root = resolve(config.localStorageDir);
  private path(key: string) {
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root)) throw new Error("Key tidak valid");
    return p;
  }

  uploadTarget(uploadId: string): UploadTarget {
    const token = signToken({ kind: "put", uploadId, exp: Date.now() + SIGNED_URL_SECONDS * 1000 });
    return { method: "PUT", url: `${config.appUrl}/api/v1/uploads/${token}`, headers: {} };
  }

  async read(key: string, maxBytes: number): Promise<ReadResult> {
    const file = Bun.file(this.path(key));
    if (!(await file.exists())) return { kind: "missing" };
    if (file.size > maxBytes) return { kind: "too_large" };
    return { kind: "ok", bytes: new Uint8Array(await file.arrayBuffer()) };
  }

  async write(key: string, bytes: Uint8Array, _mime?: string) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes);
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }

  downloadUrl(key: string, o: DownloadOptions): string {
    const token = signToken({ kind: "get", key, mime: o.mime, disposition: disposition(o), exp: Date.now() + SIGNED_URL_SECONDS * 1000 });
    return `${config.appUrl}/api/v1/files/${token}`;
  }

  localFile(key: string) {
    return Bun.file(this.path(key));
  }

  async sweepTemp(olderThanMs: number) {
    const dir = this.path(TEMP_PREFIX);
    const names = await readdir(dir).catch(() => [] as string[]);
    let removed = 0;
    for (const n of names) {
      const p = join(dir, n);
      const s = await stat(p).catch(() => null);
      if (s && Date.now() - s.mtimeMs > olderThanMs) {
        await rm(p, { force: true });
        removed++;
      }
    }
    return removed;
  }

  async ping() {
    await mkdir(this.root, { recursive: true });
    return true;
  }
}

/** Driver aktif. `useStorage` hanya dipakai test untuk menguji kedua driver. */
export let storage: StorageDriver = config.storageDriver === "local" ? new LocalDriver() : new S3Driver();

export function useStorage(driver: "s3" | "local") {
  storage = driver === "local" ? new LocalDriver() : new S3Driver();
}

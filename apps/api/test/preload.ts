// Test selalu memakai database terpisah dan driver lokal bawaan; test S3 mengganti driver sendiri.
const url = new URL(process.env.DATABASE_URL!);
url.pathname = "/pendaftaran_test";
process.env.DATABASE_URL = url.toString();
process.env.APP_URL = "http://localhost";
process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = `${process.env.TMPDIR ?? "/tmp"}/pendaftaran-test-storage`;
process.env.RUN_WORKER = "false";
process.env.NODE_ENV = "test";
process.env.S3_ENDPOINT = process.env.S3_ENDPOINT ?? "http://127.0.0.1:59000";
// Test berjalan tanpa Nginx, jadi URL presigned langsung ke RustFS.
process.env.S3_PUBLIC_ENDPOINT = "http://127.0.0.1:59000";

// Uji Fondasi (PRD 6.6): presigned PUT/GET lewat Nginx dengan S3_PUBLIC_ENDPOINT.
import { S3Client } from "bun";

const pub = new S3Client({
  endpoint: process.env.S3_PUBLIC_ENDPOINT!,
  bucket: process.env.S3_BUCKET!,
  region: process.env.S3_REGION!,
  accessKeyId: process.env.S3_ACCESS_KEY!,
  secretAccessKey: process.env.S3_SECRET_KEY!,
});

const key = `uploads/proxy-check-${Date.now()}`;
const results: Record<string, unknown> = {};

const putUrl = pub.presign(key, { method: "PUT", expiresIn: 300 });
results.host = new URL(putUrl).host;
results.path = new URL(putUrl).pathname;

const small = new Uint8Array(1024).fill(65);
const put = await fetch(putUrl, { method: "PUT", body: small });
results.put_1kb = put.status;

const big = new Uint8Array(2 * 1024 * 1024).fill(66);
results.put_2mb = (await fetch(putUrl, { method: "PUT", body: big })).status;

const tooBig = new Uint8Array(7 * 1024 * 1024).fill(67);
results.put_7mb_expect_413 = (await fetch(putUrl, { method: "PUT", body: tooBig })).status;

const get = await fetch(pub.presign(key, { method: "GET", expiresIn: 300 }));
results.get = get.status;
results.get_bytes = (await get.arrayBuffer()).byteLength;
results.nosniff = get.headers.get("x-content-type-options");

const tampered = new URL(pub.presign(key, { method: "GET", expiresIn: 300 }));
tampered.searchParams.set("X-Amz-Signature", "0".repeat(64));
results.tampered_expect_403 = (await fetch(tampered)).status;

const noSig = new URL(putUrl);
results.anon_get_expect_403 = (await fetch(`${noSig.origin}${noSig.pathname}`)).status;

const wrongHost = new URL(pub.presign(key, { method: "GET", expiresIn: 300 }));
wrongHost.host = wrongHost.host.replace("localhost", "127.0.0.1");
results.wrong_host_expect_403 = (await fetch(wrongHost)).status;

await fetch(pub.presign(key, { method: "DELETE", expiresIn: 300 }), { method: "DELETE" });
console.log(JSON.stringify(results, null, 2));

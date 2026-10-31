// Membuat bucket privat bila belum ada. S3 Bun tidak punya CreateBucket, jadi ditandatangani manual (SigV4).
import { createHash, createHmac } from "node:crypto";

const endpoint = new URL(process.env.S3_ENDPOINT!);
const bucket = process.env.S3_BUCKET!;
const region = process.env.S3_REGION ?? "us-east-1";
const accessKey = process.env.S3_ACCESS_KEY!;
const secretKey = process.env.S3_SECRET_KEY!;

const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

async function signedRequest(method: string, path: string) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update("").digest("hex");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = [method, path, "", `host:${endpoint.host}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`, "", signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return fetch(`${endpoint.origin}${path}`, {
    method,
    headers: {
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });
}

let res: Response | undefined;
for (let i = 0; i < 20; i++) {
  try {
    res = await signedRequest("HEAD", `/${bucket}`);
    break;
  } catch {
    await Bun.sleep(1000);
  }
}
if (!res) throw new Error("RustFS tidak bisa dihubungi");
if (res.status === 200) {
  console.log(`Bucket ${bucket} sudah ada.`);
} else {
  const created = await signedRequest("PUT", `/${bucket}`);
  if (!created.ok) throw new Error(`Gagal membuat bucket: ${created.status} ${await created.text()}`);
  console.log(`Bucket ${bucket} dibuat (privat).`);
}

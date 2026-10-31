function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variabel ${name} belum diisi di .env`);
  return v;
}

export const config = {
  appUrl: required("APP_URL").replace(/\/$/, ""),
  appKey: required("APP_KEY"),
  databaseUrl: required("DATABASE_URL"),
  runWorker: process.env.RUN_WORKER === "true",
  port: Number(process.env.PORT ?? 3000),
  storageDriver: (process.env.STORAGE_DRIVER ?? "s3") as "s3" | "local",
  localStorageDir: process.env.LOCAL_STORAGE_DIR ?? "./storage-local",
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "",
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? "",
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "",
    accessKey: process.env.S3_ACCESS_KEY ?? "",
    secretKey: process.env.S3_SECRET_KEY ?? "",
  },
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.MAIL_FROM ?? "Panitia Pendaftaran <panitia@localhost>",
  },
};

export const isHttps = config.appUrl.startsWith("https://");

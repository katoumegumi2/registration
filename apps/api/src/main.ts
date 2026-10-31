import { buildApp } from "./app";
import { config } from "./shared/config";
import { startWorker } from "./worker";

const app = buildApp();
if (config.runWorker) startWorker();

// Sedikit di atas 6 MB supaya batas Nginx yang memutuskan, bukan Bun.
export default { port: config.port, fetch: app.fetch, maxRequestBodySize: 7 * 1024 * 1024 };
console.log(JSON.stringify({ t: new Date().toISOString(), msg: `API berjalan di port ${config.port}` }));

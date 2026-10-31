import { join } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, pg } from "../shared/db/client";

await migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });
console.log("Migration selesai.");
await pg.end();

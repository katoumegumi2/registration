import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config";

export const pg = postgres(config.databaseUrl, { max: 30, onnotice: () => {} });
export const db = drizzle(pg);

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export const PAGE_SIZE = 20;

export function paginate(page: number | undefined, size = PAGE_SIZE) {
  const p = Math.max(1, page ?? 1);
  return { page: p, limit: size, offset: (p - 1) * size };
}

export const newId = () => Bun.randomUUIDv7();

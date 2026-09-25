import "server-only";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { join } from "node:path";
import * as schema from "./schema";
import { databaseUrl, isLocalDb } from "./url";

export { isLocalDb };

export type DB = LibSQLDatabase<typeof schema>;

/** DB を開く。url は "file:local.db"、"libsql://…"（Turso）、テストでは ":memory:" */
export function createDb(url: string, authToken?: string): DB {
  return drizzle(createClient({ url, authToken }), { schema });
}

export async function migrateDb(db: DB, root = process.cwd()): Promise<void> {
  await migrate(db, { migrationsFolder: join(root, "drizzle") });
}

/** テストとスクリプト用: 開いて、ローカルならマイグレーションを適用する */
export async function openDb(url: string, options: { authToken?: string; root?: string } = {}): Promise<DB> {
  const db = createDb(url, options.authToken);
  if (isLocalDb(url)) await migrateDb(db, options.root);
  return db;
}

// 開発サーバーのホットリロードで接続が増えないよう globalThis に保持する
const globalForDb = globalThis as unknown as { db?: DB };

/** アプリ用の DB。ローカルのマイグレーションはサーバーの起動時に instrumentation.ts で適用する */
export function getDb(): DB {
  globalForDb.db ??= createDb(databaseUrl(), process.env.DATABASE_AUTH_TOKEN);
  return globalForDb.db;
}

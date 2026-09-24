import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { join } from "node:path";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

/** マイグレーション適用済みの DB を開く。テストでは ":memory:" を渡す */
export function openDb(file: string, root = process.cwd()): DB {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: join(root, "drizzle") });
  return db;
}

// 開発サーバーのホットリロードで接続が増えないよう globalThis に保持する
const globalForDb = globalThis as unknown as { db?: DB };

export function getDb(): DB {
  globalForDb.db ??= openDb(process.env.DB_FILE ?? join(process.cwd(), "local.db"));
  return globalForDb.db;
}

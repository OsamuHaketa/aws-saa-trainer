import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { join } from "node:path";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

/** ローカルの DB（ファイル / メモリ）か。ローカルだけ起動時にマイグレーションを適用する */
const isLocal = (url: string) => url.startsWith("file:") || url === ":memory:";

/**
 * DB を開く。url は "file:local.db"、"libsql://…"（Turso）、テストでは ":memory:"。
 * ローカルの DB にはマイグレーションを適用してから返す。Turso には npm run db:migrate で適用する
 */
export async function openDb(url: string, options: { authToken?: string; root?: string } = {}): Promise<DB> {
  const client = createClient({ url, authToken: options.authToken });
  const db = drizzle(client, { schema });
  if (isLocal(url)) {
    await client.execute("PRAGMA journal_mode = WAL");
    await migrate(db, { migrationsFolder: join(options.root ?? process.cwd(), "drizzle") });
  }
  return db;
}

// 開発サーバーのホットリロードで接続が増えないよう globalThis に保持する
const globalForDb = globalThis as unknown as { db?: Promise<DB> };

export function getDb(): Promise<DB> {
  globalForDb.db ??= openDb(process.env.DATABASE_URL ?? "file:local.db", {
    authToken: process.env.DATABASE_AUTH_TOKEN,
  }).catch((e) => {
    globalForDb.db = undefined; // 失敗したら次のリクエストで開き直す
    throw e;
  });
  return globalForDb.db;
}

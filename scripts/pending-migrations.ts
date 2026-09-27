/**
 * DB にまだ適用していないマイグレーションの名前を 1 行ずつ出す（すべて適用済みなら何も出さない）。
 * drizzle の migrator と同じく、__drizzle_migrations の created_at の最大値より新しい journal のエントリを未適用とみなす。
 *
 * 使い方（scripts/deploy.sh から呼ぶ）:
 *   npx tsx scripts/pending-migrations.ts                                     # ローカルの local.db
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npx tsx scripts/pending-migrations.ts   # Turso
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const journal = JSON.parse(readFileSync(join(ROOT, "drizzle", "meta", "_journal.json"), "utf8")) as {
  entries: { tag: string; when: number }[];
};
const client = createClient({
  url: process.env.DATABASE_URL ?? `file:${join(ROOT, "local.db")}`,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

let last = 0;
const { rows: tables } = await client.execute(
  "select name from sqlite_master where type = 'table' and name = '__drizzle_migrations'",
);
if (tables.length > 0) {
  const { rows } = await client.execute("select max(created_at) as last from __drizzle_migrations");
  last = Number(rows[0]?.last ?? 0);
}
for (const entry of journal.entries) {
  if (entry.when > last) console.log(entry.tag);
}
client.close();

/**
 * 学習記録（作り直せないデータ）を JSON に書き出す。
 *   対象: user・cards・review_logs・followups（セッションや OAuth のトークンは含めない）
 *   出力: backups/<日時>/<テーブル>.json（列名も値も DB のまま。scripts/import-records.ts で読み込める）
 *
 * 使い方:
 *   npm run backup                                    # ローカルの local.db
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run backup   # Turso
 */
import { createClient } from "@libsql/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BACKUP_TABLES = ["user", "cards", "review_logs", "followups"] as const;

const ROOT = join(import.meta.dirname, "..");
const url = process.env.DATABASE_URL ?? `file:${join(ROOT, "local.db")}`;
const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = join(ROOT, "backups", stamp);
mkdirSync(dir, { recursive: true });

for (const table of BACKUP_TABLES) {
  const { rows } = await client.execute(`select * from \`${table}\``);
  // Row は配列にもなっているオブジェクトなので、列名 → 値の普通のオブジェクトにする
  const plain = rows.map((r) => Object.fromEntries(Object.entries(r)));
  writeFileSync(join(dir, `${table}.json`), JSON.stringify(plain, null, 1));
  console.log(`${table}: ${plain.length} 行`);
}
console.log(`→ ${dir}`);
client.close();

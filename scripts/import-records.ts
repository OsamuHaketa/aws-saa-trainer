/**
 * バックアップ（scripts/backup.ts の出力）から、1 人分の学習記録を別の DB のユーザーに取り込む。
 * local.db の記録を本番に移すときと、バックアップから戻すときに使う。
 *
 *   - review_logs と followups の ID は振り直さずにそのまま入れる（source_log_id / followup_id の対応を保つため）
 *   - 取り込み先のユーザーに記録がすでにある、または ID がぶつかる場合は、何も書かずに中止する
 *   - 1 回の batch（トランザクション）で書き込み、失敗したらすべて取り消される
 *   - 書き込んだあと、件数が一致するかを確認する
 *
 * 使い方:
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run import-records -- \
 *     --from backups/<日時> --to-email you@example.com [--source-user local-owner] [--dry-run]
 *
 * 取り込み先のユーザーは、先にアプリに 1 回ログインして作っておく。
 */
import { createClient, type InStatement } from "@libsql/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

type Row = Record<string, unknown>;

const { values: args } = parseArgs({
  options: {
    from: { type: "string" },
    "to-email": { type: "string" },
    "source-user": { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});
if (!args.from || !args["to-email"]) {
  console.error("--from <バックアップのディレクトリ> と --to-email <取り込み先のメールアドレス> を指定してください");
  process.exit(1);
}

const read = (table: string): Row[] => JSON.parse(readFileSync(join(args.from!, `${table}.json`), "utf8"));
const users = read("user");
const all = { cards: read("cards"), review_logs: read("review_logs"), followups: read("followups") };

// 取り込み元のユーザー: 指定がなければ、記録を持っているユーザーが 1 人だけならその人
const owners = [...new Set([...all.cards, ...all.review_logs, ...all.followups].map((r) => String(r.user_id)))];
const sourceUser = args["source-user"] ?? (owners.length === 1 ? owners[0] : undefined);
if (!sourceUser) {
  console.error(`記録を持つユーザーが ${owners.length} 人います。--source-user で指定してください: ${owners.join(", ")}`);
  process.exit(1);
}
const source = {
  cards: all.cards.filter((r) => r.user_id === sourceUser),
  review_logs: all.review_logs.filter((r) => r.user_id === sourceUser),
  followups: all.followups.filter((r) => r.user_id === sourceUser),
};
const sourceEmail = users.find((u) => u.id === sourceUser)?.email ?? "?";
console.log(`取り込み元: ${sourceUser}（${sourceEmail}） cards ${source.cards.length} / review_logs ${source.review_logs.length} / followups ${source.followups.length}`);

const url = process.env.DATABASE_URL ?? "file:local.db";
const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const one = async (sql: string, params: (string | number)[] = []) => (await client.execute({ sql, args: params })).rows[0];

const target = await one("select id from user where lower(email) = lower(?)", [args["to-email"]]);
if (!target) {
  console.error(`取り込み先の DB（${url}）に ${args["to-email"]} のユーザーがいません。先にアプリに 1 回ログインしてください`);
  process.exit(1);
}
const targetId = String(target.id);
console.log(`取り込み先: ${targetId}（${args["to-email"]}） ${url}`);

// 中止する条件: 取り込み先のユーザーに記録がすでにある / ID がぶつかる
const count = async (table: string) =>
  Number((await one(`select count(*) as n from \`${table}\` where user_id = ?`, [targetId]))!.n);
const existing = { cards: await count("cards"), review_logs: await count("review_logs"), followups: await count("followups") };
if (existing.cards + existing.review_logs + existing.followups > 0) {
  console.error(`取り込み先のユーザーに記録がすでにあります（${JSON.stringify(existing)}）。二重に取り込まないよう中止します`);
  process.exit(1);
}
for (const table of ["review_logs", "followups"] as const) {
  const ids = source[table].map((r) => Number(r.id));
  if (ids.length === 0) continue;
  const clash = await one(`select count(*) as n from \`${table}\` where id in (${ids.map(() => "?").join(",")})`, ids);
  if (Number(clash!.n) > 0) {
    console.error(`${table} の ID が取り込み先の既存の行とぶつかります（${clash!.n} 件）。中止します`);
    process.exit(1);
  }
}

const insert = (table: string, row: Row): InStatement => {
  const values = { ...row, user_id: targetId };
  const cols = Object.keys(values);
  return {
    sql: `insert into \`${table}\` (${cols.map((c) => `\`${c}\``).join(", ")}) values (${cols.map(() => "?").join(", ")})`,
    args: Object.values(values) as (string | number | null)[],
  };
};
const statements = [
  ...source.cards.map((r) => insert("cards", r)),
  ...source.review_logs.map((r) => insert("review_logs", r)),
  ...source.followups.map((r) => insert("followups", r)),
];

if (args["dry-run"]) {
  console.log(`--dry-run: ${statements.length} 行を書き込む予定です（書き込みはしていません）`);
  process.exit(0);
}

await client.batch(statements, "write");

const after = { cards: await count("cards"), review_logs: await count("review_logs"), followups: await count("followups") };
const expected = { cards: source.cards.length, review_logs: source.review_logs.length, followups: source.followups.length };
const ok = JSON.stringify(after) === JSON.stringify(expected);
console.log(`取り込み後: ${JSON.stringify(after)} ${ok ? "✓ 件数が一致" : `✖ 期待 ${JSON.stringify(expected)}`}`);
console.log("アプリのホーム（復習待ち）と分析画面（回答数・正答率）も、取り込み元と同じになっているか確認してください");
client.close();
process.exit(ok ? 0 : 1);

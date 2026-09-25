/** サーバーの起動時に 1 回だけ呼ばれる。ローカルの DB にだけマイグレーションを適用する（Turso には npm run db:migrate） */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb, isLocalDb, migrateDb } = await import("./lib/db");
  if (isLocalDb()) await migrateDb(getDb());
}

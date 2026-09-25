// proxy.ts からも使うので、ここではほかのモジュールを読み込まない

export const databaseUrl = () => process.env.DATABASE_URL ?? "file:local.db";

/** ローカルの DB（ファイル / メモリ）か */
export const isLocalDb = (url = databaseUrl()) => url.startsWith("file:") || url === ":memory:";

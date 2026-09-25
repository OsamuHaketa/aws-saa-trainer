import { isLocalDb } from "@/lib/db/url";

// proxy.ts からも使うので、DB などは読み込まない

/** ユーザーの区別がなかったころの学習記録の持ち主（drizzle/0001_users_and_auth.sql で作る） */
export const LOCAL_OWNER_ID = "local-owner";

/**
 * ローカル専用モード: 開発サーバー・ローカルの DB・Google の設定なし、の 3 つがそろったときだけ、
 * ログインせずに local-owner として使える（Google の OAuth クライアントを作る前でも学習を続けられるように）。
 * 本番のビルド（NODE_ENV=production）では必ず無効になる
 */
export const isLocalOwnerMode = () =>
  process.env.NODE_ENV === "development" && isLocalDb() && !process.env.GOOGLE_CLIENT_ID;
